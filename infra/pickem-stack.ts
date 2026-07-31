import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { CfnApp, CfnBranch } from "aws-cdk-lib/aws-amplify";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { UserPool, UserPoolClient, UserPoolClientIdentityProvider, UserPoolGroup } from "aws-cdk-lib/aws-cognito";
import { CfnStage, HttpApi, CorsHttpMethod, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { Construct } from "constructs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Alarm, ComparisonOperator, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";

export class PickemStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const resourcePrefix = "pickem-bot-v1-run2";
    const enableAmplify = process.env.ENABLE_AMPLIFY !== "false";
    const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "https://master.d16nzdj1k2k1wu.amplifyapp.com,https://master.d3j7zlwjnm04rp.amplifyapp.com,https://master.d3v9lgp3ju9tca.amplifyapp.com")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    const alarmEmail = process.env.ALARM_EMAIL ?? "grantoenges@gmail.com";

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

    new UserPoolGroup(this, "AdminGroup", {
      userPool,
      groupName: "admin"
    });

    new UserPoolGroup(this, "SuperAdminGroup", {
      userPool,
      groupName: "super_admin"
    });

    new UserPoolGroup(this, "PlayerGroup", {
      userPool,
      groupName: "player"
    });

    const cfpScraperFunction = new NodejsFunction(this, "CfpOddsScraperFunction", {
      runtime: Runtime.NODEJS_22_X,
      functionName: `${resourcePrefix}-cfp-odds-scraper`,
      entry: "src/backend/cfpOddsScraper.ts",
      handler: "handler",
      timeout: Duration.minutes(5),
      memorySize: 1024,
      logGroup: lambdaLogGroup(this, "CfpOddsScraperLogGroup", `${resourcePrefix}-cfp-odds-scraper`),
      environment: {
        TABLE_NAME: table.tableName
      }
    });
    grantTableAccess(cfpScraperFunction, table, [
      "dynamodb:PutItem",
      "dynamodb:Query"
    ]);

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
        CFP_SCRAPER_FUNCTION_NAME: cfpScraperFunction.functionName,
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
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminListGroupsForUser",
        "cognito-idp:AdminDeleteUser"
      ],
      resources: [userPool.userPoolArn]
    }));
    cfpScraperFunction.grantInvoke(apiFunction);

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
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:Scan"
    ]);

    const alarmTopic = new Topic(this, "OpsAlarmTopic", {
      topicName: `${resourcePrefix}-ops-alarms`
    });
    alarmTopic.addSubscription(new EmailSubscription(alarmEmail));

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

    new Rule(this, "CfpOddsScrapeRule", {
      ruleName: `${resourcePrefix}-cfp-odds-scrape`,
      description: "Refreshes DraftKings college football playoff qualification odds daily.",
      schedule: Schedule.cron({ minute: "0", hour: "12" }),
      targets: [new LambdaFunction(cfpScraperFunction)]
    });

    addLambdaErrorAlarm(this, "ApiErrorAlarm", `${resourcePrefix}-api-errors`, apiFunction, alarmTopic);
    addLambdaErrorAlarm(this, "ScraperErrorAlarm", `${resourcePrefix}-scraper-errors`, scraperFunction, alarmTopic);
    addLambdaErrorAlarm(this, "ScrapeSchedulerErrorAlarm", `${resourcePrefix}-scrape-scheduler-errors`, scrapeSchedulerFunction, alarmTopic);
    addLambdaErrorAlarm(this, "ResultsSyncErrorAlarm", `${resourcePrefix}-results-sync-errors`, resultsFunction, alarmTopic);
    addLambdaErrorAlarm(this, "CfpScraperErrorAlarm", `${resourcePrefix}-cfp-scraper-errors`, cfpScraperFunction, alarmTopic);

    if (enableAmplify) {
      const githubSecret = Secret.fromSecretNameV2(this, "GithubPatSecret", `${resourcePrefix}-github-pat`);

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
    new CfnOutput(this, "CfpOddsScraperFunctionName", {
      value: cfpScraperFunction.functionName
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
    retention: RetentionDays.TWO_WEEKS,
    removalPolicy: RemovalPolicy.RETAIN
  });
}

function addLambdaErrorAlarm(scope: Construct, id: string, alarmName: string, fn: NodejsFunction, topic: Topic): void {
  const alarm = new Alarm(scope, id, {
    alarmName,
    metric: fn.metricErrors({ period: Duration.minutes(5) }),
    threshold: 1,
    evaluationPeriods: 1,
    datapointsToAlarm: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING
  });
  alarm.addAlarmAction(new SnsAction(topic));
}
