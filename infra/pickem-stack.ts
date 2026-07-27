import { CfnOutput, CfnParameter, Duration, RemovalPolicy, SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { CfnApp, CfnBranch } from "aws-cdk-lib/aws-amplify";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { CfnUserPoolUser, CfnUserPoolUserToGroupAttachment, UserPool, UserPoolClient, UserPoolClientIdentityProvider, UserPoolGroup } from "aws-cdk-lib/aws-cognito";
import { CfnStage, HttpApi, CorsHttpMethod, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { Construct } from "constructs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

export class PickemStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const resourcePrefix = "pickem-bot-v1-run2";
    const firstAdminEmail = process.env.FIRST_ADMIN_EMAIL;
    const enableAmplify = process.env.ENABLE_AMPLIFY === "true";
    const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "https://master.d3v9lgp3ju9tca.amplifyapp.com")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

    const table = new Table(this, "PickemTable", {
      tableName: `${resourcePrefix}-table`,
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN
    });

    const userPool = new UserPool(this, "PickemUserPool", {
      userPoolName: `${resourcePrefix}-users`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3)
      },
      removalPolicy: RemovalPolicy.RETAIN
    });

    const userPoolClient = new UserPoolClient(this, "PickemUserPoolClient", {
      userPoolClientName: `${resourcePrefix}-web-client`,
      userPool,
      authFlows: { userSrp: true },
      accessTokenValidity: Duration.minutes(30),
      idTokenValidity: Duration.minutes(30),
      refreshTokenValidity: Duration.days(7),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO]
    });

    const adminGroup = new UserPoolGroup(this, "AdminGroup", {
      userPool,
      groupName: "admin"
    });

    const superAdminGroup = new UserPoolGroup(this, "SuperAdminGroup", {
      userPool,
      groupName: "super_admin"
    });

    new UserPoolGroup(this, "PlayerGroup", {
      userPool,
      groupName: "player"
    });

    if (firstAdminEmail) {
      const firstAdmin = new CfnUserPoolUser(this, "FirstAdminUser", {
        userPoolId: userPool.userPoolId,
        username: firstAdminEmail,
        desiredDeliveryMediums: ["EMAIL"],
        userAttributes: [
          { name: "email", value: firstAdminEmail },
          { name: "email_verified", value: "true" }
        ]
      });

      const adminAttachment = new CfnUserPoolUserToGroupAttachment(this, "FirstAdminGroupAttachment", {
        userPoolId: userPool.userPoolId,
        groupName: "admin",
        username: firstAdmin.ref
      });
      adminAttachment.node.addDependency(adminGroup);

      const superAdminAttachment = new CfnUserPoolUserToGroupAttachment(this, "FirstSuperAdminGroupAttachment", {
        userPoolId: userPool.userPoolId,
        groupName: "super_admin",
        username: firstAdmin.ref
      });
      superAdminAttachment.node.addDependency(superAdminGroup);
    }

    const apiFunction = new NodejsFunction(this, "PickemApiFunction", {
      runtime: Runtime.NODEJS_22_X,
      functionName: `${resourcePrefix}-api`,
      entry: "src/backend/api.ts",
      handler: "handler",
      timeout: Duration.seconds(10),
      logGroup: lambdaLogGroup(this, "PickemApiLogGroup", `${resourcePrefix}-api`),
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
        CORS_ALLOWED_ORIGINS: corsAllowedOrigins.join(",")
      }
    });
    grantTableAccess(apiFunction, table, [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:TransactWriteItems"
    ]);
    apiFunction.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminGetUser"
      ],
      resources: [userPool.userPoolArn]
    }));

    const scraperFunction = new NodejsFunction(this, "DraftKingsScraperFunction", {
      runtime: Runtime.NODEJS_22_X,
      functionName: `${resourcePrefix}-draftkings-scraper`,
      entry: "src/backend/draftkingsScraper.ts",
      handler: "handler",
      timeout: Duration.minutes(5),
      memorySize: 1024,
      logGroup: lambdaLogGroup(this, "DraftKingsScraperLogGroup", `${resourcePrefix}-draftkings-scraper`),
      environment: {
        TABLE_NAME: table.tableName
      }
    });
    grantTableAccess(scraperFunction, table, [
      "dynamodb:PutItem",
      "dynamodb:Query"
    ]);

    const scrapeSchedulerFunction = new NodejsFunction(this, "DraftKingsScrapeSchedulerFunction", {
      runtime: Runtime.NODEJS_22_X,
      functionName: `${resourcePrefix}-draftkings-scrape-scheduler`,
      entry: "src/backend/scrapeScheduler.ts",
      handler: "handler",
      timeout: Duration.minutes(6),
      logGroup: lambdaLogGroup(this, "DraftKingsScrapeSchedulerLogGroup", `${resourcePrefix}-draftkings-scrape-scheduler`),
      environment: {
        TABLE_NAME: table.tableName,
        SCRAPER_FUNCTION_NAME: scraperFunction.functionName
      }
    });
    grantTableAccess(scrapeSchedulerFunction, table, [
      "dynamodb:PutItem",
      "dynamodb:Scan"
    ]);
    scraperFunction.grantInvoke(scrapeSchedulerFunction);

    const resultsFunction = new NodejsFunction(this, "ResultsSyncFunction", {
      runtime: Runtime.NODEJS_22_X,
      functionName: `${resourcePrefix}-results-sync`,
      entry: "src/backend/resultsHandler.ts",
      handler: "handler",
      timeout: Duration.minutes(2),
      logGroup: lambdaLogGroup(this, "ResultsSyncLogGroup", `${resourcePrefix}-results-sync`),
      environment: {
        TABLE_NAME: table.tableName
      }
    });
    grantTableAccess(resultsFunction, table, [
      "dynamodb:Scan"
    ]);

    const authorizer = new HttpUserPoolAuthorizer("PickemAuthorizer", userPool, {
      userPoolClients: [userPoolClient]
    });

    const httpApi = new HttpApi(this, "PickemHttpApi", {
      apiName: `${resourcePrefix}-http-api`,
      corsPreflight: {
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS],
        allowOrigins: corsAllowedOrigins,
        maxAge: Duration.hours(1)
      }
    });

    const apiIntegration = new HttpLambdaIntegration("PickemApiIntegration", apiFunction);
    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [HttpMethod.OPTIONS],
      integration: apiIntegration
    });
    httpApi.addRoutes({
      path: "/{proxy+}",
      integration: apiIntegration,
      authorizer
    });
    httpApi.addRoutes({
      path: "/health",
      integration: apiIntegration
    });
    const defaultStage = httpApi.defaultStage?.node.defaultChild as CfnStage | undefined;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = {
        throttlingBurstLimit: 50,
        throttlingRateLimit: 25
      };
    }

    new Rule(this, "DraftKingsScrapeSchedulerRule", {
      ruleName: `${resourcePrefix}-draftkings-scrape-scheduler`,
      description: "Polls for league weeks whose configured DraftKings capture time is due.",
      schedule: Schedule.rate(Duration.minutes(15)),
      targets: [new LambdaFunction(scrapeSchedulerFunction)]
    });

    new Rule(this, "ResultsSyncRule", {
      ruleName: `${resourcePrefix}-results-sync`,
      description: "Checks for final scores separately from odds scraping.",
      schedule: Schedule.cron({
        minute: "0",
        hour: "5"
      }),
      targets: [new LambdaFunction(resultsFunction)]
    });

    if (enableAmplify) {
      const githubPatParameter = new CfnParameter(this, "GithubPat", {
        type: "String",
        noEcho: true,
        description: "GitHub PAT used by the new Amplify app to connect to granttoenges/pickem_bot."
      });

      const githubSecret = new Secret(this, "GithubPatSecret", {
        secretName: `${resourcePrefix}-github-pat`,
        secretStringValue: SecretValue.unsafePlainText(githubPatParameter.valueAsString)
      });

      const amplifyApp = new CfnApp(this, "AmplifyApp", {
        name: `${resourcePrefix}-amplify`,
        repository: "https://github.com/granttoenges/pickem_bot",
        accessToken: githubSecret.secretValue.toString(),
        platform: "WEB_COMPUTE",
        environmentVariables: [
          { name: "NEXT_PUBLIC_AWS_REGION", value: this.region },
          { name: "NEXT_PUBLIC_API_BASE_URL", value: httpApi.apiEndpoint },
          { name: "NEXT_PUBLIC_COGNITO_USER_POOL_ID", value: userPool.userPoolId },
          { name: "NEXT_PUBLIC_COGNITO_CLIENT_ID", value: userPoolClient.userPoolClientId },
          { name: "NEXT_PUBLIC_SEASON_ID", value: new Date().getFullYear().toString() },
          { name: "NEXT_PUBLIC_WEEK_ID", value: "1" }
        ],
        buildSpec: [
          "version: 1",
          "frontend:",
          "  phases:",
          "    preBuild:",
          "      commands:",
          "        - npm ci",
          "    build:",
          "      commands:",
          "        - npm run build",
          "  artifacts:",
          "    baseDirectory: .next",
          "    files:",
          "      - '**/*'",
          "  cache:",
          "    paths:",
          "      - node_modules/**/*"
        ].join("\n")
      });

      new CfnBranch(this, "AmplifyMasterBranch", {
        appId: amplifyApp.attrAppId,
        branchName: "master",
        enableAutoBuild: true,
        stage: "PRODUCTION"
      });

      new CfnOutput(this, "AmplifyDefaultDomain", {
        value: amplifyApp.attrDefaultDomain
      });
    }

    new CfnOutput(this, "ApiBaseUrl", {
      value: httpApi.apiEndpoint
    });
    new CfnOutput(this, "CognitoUserPoolId", {
      value: userPool.userPoolId
    });
    new CfnOutput(this, "CognitoUserPoolClientId", {
      value: userPoolClient.userPoolClientId
    });
    new CfnOutput(this, "DraftKingsScraperFunctionName", {
      value: scraperFunction.functionName
    });
  }
}

function grantTableAccess(fn: NodejsFunction, table: Table, actions: string[]): void {
  fn.addToRolePolicy(new PolicyStatement({
    effect: Effect.ALLOW,
    actions,
    resources: [table.tableArn]
  }));
}

function lambdaLogGroup(scope: Construct, id: string, functionName: string): LogGroup {
  return new LogGroup(scope, id, {
    logGroupName: `/pickem-bot-v1-run2/lambda/${functionName}-secure`,
    retention: RetentionDays.ONE_MONTH,
    removalPolicy: RemovalPolicy.RETAIN
  });
}
