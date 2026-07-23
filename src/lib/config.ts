export const appConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  awsRegion: process.env.NEXT_PUBLIC_AWS_REGION ?? "us-east-1",
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
  userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
  seasonId: process.env.NEXT_PUBLIC_SEASON_ID ?? new Date().getFullYear().toString(),
  weekId: process.env.NEXT_PUBLIC_WEEK_ID ?? "1"
};
