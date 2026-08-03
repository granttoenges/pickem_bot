import {
  AdminCreateUserCommand,
  AdminCreateUserCommandOutput,
  AdminGetUserCommand,
  AdminGetUserCommandOutput
} from "@aws-sdk/client-cognito-identity-provider";

export interface CognitoInviteClient {
  send(command: AdminGetUserCommand): Promise<AdminGetUserCommandOutput>;
  send(command: AdminCreateUserCommand): Promise<AdminCreateUserCommandOutput>;
}

export type CognitoInviteResult = {
  userId?: string;
  invitationAction: "created" | "resent" | "none";
};

export async function ensureCognitoInvite(
  client: CognitoInviteClient,
  userPoolId: string,
  email: string
): Promise<CognitoInviteResult> {
  try {
    const existing = await client.send(new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: email
    }));
    const userId = findAttribute(existing.UserAttributes, "sub");

    if (existing.UserStatus === "FORCE_CHANGE_PASSWORD") {
      await client.send(invitationCommand(userPoolId, email, "RESEND"));
      return { userId, invitationAction: "resent" };
    }

    return { userId, invitationAction: "none" };
  } catch (error) {
    if (!isUserNotFoundError(error)) {
      throw error;
    }

    const created = await client.send(invitationCommand(userPoolId, email));
    return {
      userId: findAttribute(created.User?.Attributes, "sub"),
      invitationAction: "created"
    };
  }
}

function invitationCommand(userPoolId: string, email: string, messageAction?: "RESEND") {
  return new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: email,
    MessageAction: messageAction,
    DesiredDeliveryMediums: ["EMAIL"],
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "email_verified", Value: "true" }
    ]
  });
}

function findAttribute(attributes: { Name?: string; Value?: string }[] | undefined, name: string): string | undefined {
  return attributes?.find((attribute) => attribute.Name === name)?.Value;
}

function isUserNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "UserNotFoundException";
}
