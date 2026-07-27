const crypto = require("crypto");
const {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient
} = require("@aws-sdk/client-cognito-identity-provider");

const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "us-east-1_eYgApGW0A";
const email = process.env.SUPER_ADMIN_EMAIL ?? process.env.FIRST_ADMIN_EMAIL ?? "grantoenges@gmail.com";
const resetTempPassword = process.argv.includes("--reset-temp");
const cognito = new CognitoIdentityProviderClient({});

async function main() {
  const user = await getUser();

  if (!user) {
    await createUser();
    await addToSuperAdminGroup();
    console.log(`Created ${email}, sent a temporary-password email, and added super_admin.`);
    return;
  }

  await addToSuperAdminGroup();

  if (resetTempPassword || user.UserStatus === "RESET_REQUIRED") {
    await forceTemporaryPassword();
    await resendInvite();
    console.log(`Reset ${email} into temporary-password flow and resent the invite email.`);
    return;
  }

  if (user.UserStatus === "FORCE_CHANGE_PASSWORD") {
    await resendInvite();
    console.log(`Resent the temporary-password invite for ${email}.`);
    return;
  }

  console.log(`${email} exists, is ${user.UserStatus}, and is in super_admin.`);
}

async function getUser() {
  try {
    return await cognito.send(new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: email
    }));
  } catch (error) {
    if (error.name === "UserNotFoundException") {
      return undefined;
    }
    throw error;
  }
}

async function createUser() {
  await cognito.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    DesiredDeliveryMediums: ["EMAIL"],
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "email_verified", Value: "true" }
    ]
  }));
}

async function addToSuperAdminGroup() {
  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: email,
    GroupName: "super_admin"
  }));
}

async function forceTemporaryPassword() {
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: email,
    Password: temporaryPassword(),
    Permanent: false
  }));
}

async function resendInvite() {
  await cognito.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    MessageAction: "RESEND",
    DesiredDeliveryMediums: ["EMAIL"],
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "email_verified", Value: "true" }
    ]
  }));
}

function temporaryPassword() {
  return `Temp-${crypto.randomBytes(18).toString("base64url")}aA1!`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
