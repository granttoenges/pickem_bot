import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { DockerImageCode, DockerImageFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { UserPool, UserPoolClient, UserPoolClientIdentityProvider, UserPoolGroup } from "aws-cdk-lib/aws-cognito";
import { HttpApi, CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { Construct } from "constructs";

export class PickemStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new Table(this, "PickemTable", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN
    });

    const userPool = new UserPool(this, "PickemUserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      removalPolicy: RemovalPolicy.RETAIN
    });

    const userPoolClient = new UserPoolClient(this, "PickemUserPoolClient", {
      userPool,
      authFlows: { userPassword: true, userSrp: true },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO]
    });

    new UserPoolGroup(this, "AdminGroup", {
      userPool,
      groupName: "admin"
    });

    new UserPoolGroup(this, "PlayerGroup", {
      userPool,
      groupName: "player"
    });

    const apiFunction = new NodejsFunction(this, "PickemApiFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: "src/backend/api.ts",
      handler: "handler",
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName
      }
    });
    table.grantReadWriteData(apiFunction);

    const scraperFunction = new DockerImageFunction(this, "DraftKingsScraperFunction", {
      code: DockerImageCode.fromImageAsset("scraper"),
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        TABLE_NAME: table.tableName
      }
    });
    table.grantReadWriteData(scraperFunction);

    const resultsFunction = new NodejsFunction(this, "ResultsSyncFunction", {
      runtime: Runtime.NODEJS_22_X,
      entry: "src/backend/resultsHandler.ts",
      handler: "handler",
      timeout: Duration.minutes(2),
      environment: {
        TABLE_NAME: table.tableName
      }
    });
    table.grantReadWriteData(resultsFunction);

    const authorizer = new HttpUserPoolAuthorizer("PickemAuthorizer", userPool, {
      userPoolClients: [userPoolClient]
    });

    const httpApi = new HttpApi(this, "PickemHttpApi", {
      corsPreflight: {
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.OPTIONS],
        allowOrigins: ["*"]
      }
    });

    const apiIntegration = new HttpLambdaIntegration("PickemApiIntegration", apiFunction);
    httpApi.addRoutes({
      path: "/{proxy+}",
      integration: apiIntegration,
      authorizer
    });
    httpApi.addRoutes({
      path: "/health",
      integration: apiIntegration
    });

    new Rule(this, "TuesdayOpeningLineScrapeRule", {
      description: "Runs the DraftKings opening-line scrape once on Tuesday mornings during football season.",
      schedule: Schedule.cron({
        minute: "0",
        hour: "15",
        weekDay: "TUE"
      }),
      targets: [new LambdaFunction(scraperFunction)]
    });

    new Rule(this, "ResultsSyncRule", {
      description: "Checks for final scores separately from odds scraping.",
      schedule: Schedule.cron({
        minute: "0",
        hour: "5"
      }),
      targets: [new LambdaFunction(resultsFunction)]
    });
  }
}
