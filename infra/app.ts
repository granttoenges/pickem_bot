import { App } from "aws-cdk-lib";
import { PickemStack } from "./pickem-stack";

const app = new App();

new PickemStack(app, "PickemBotV1Stack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1"
  }
});
