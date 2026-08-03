import { AdminCreateUserCommand, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { describe, expect, it, vi } from "vitest";
import { CognitoInviteClient, ensureCognitoInvite } from "../src/backend/cognitoInvite";

function clientWithResponses(...responses: unknown[]) {
  const send = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) {
      send.mockRejectedValueOnce(response);
    } else {
      send.mockResolvedValueOnce(response);
    }
  }
  return { client: { send } as unknown as CognitoInviteClient, send };
}

describe("Cognito invitation recovery", () => {
  it("resends an invitation for an existing unactivated user", async () => {
    const { client, send } = clientWithResponses(
      {
        UserStatus: "FORCE_CHANGE_PASSWORD",
        UserAttributes: [{ Name: "sub", Value: "user-1" }]
      },
      {}
    );

    await expect(ensureCognitoInvite(client, "pool-1", "player@example.com")).resolves.toEqual({
      userId: "user-1",
      invitationAction: "resent"
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBeInstanceOf(AdminGetUserCommand);
    expect(send.mock.calls[1][0]).toBeInstanceOf(AdminCreateUserCommand);
    expect((send.mock.calls[1][0] as AdminCreateUserCommand).input).toMatchObject({
      UserPoolId: "pool-1",
      Username: "player@example.com",
      MessageAction: "RESEND",
      DesiredDeliveryMediums: ["EMAIL"]
    });
  });

  it("does not send an invitation for an existing confirmed user", async () => {
    const { client, send } = clientWithResponses({
      UserStatus: "CONFIRMED",
      UserAttributes: [{ Name: "sub", Value: "user-2" }]
    });

    await expect(ensureCognitoInvite(client, "pool-1", "player@example.com")).resolves.toEqual({
      userId: "user-2",
      invitationAction: "none"
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("creates and invites a user who does not exist", async () => {
    const notFound = Object.assign(new Error("not found"), { name: "UserNotFoundException" });
    const { client, send } = clientWithResponses(notFound, {
      User: { Attributes: [{ Name: "sub", Value: "user-3" }] }
    });

    await expect(ensureCognitoInvite(client, "pool-1", "new@example.com")).resolves.toEqual({
      userId: "user-3",
      invitationAction: "created"
    });
    expect((send.mock.calls[1][0] as AdminCreateUserCommand).input.MessageAction).toBeUndefined();
  });

  it("does not treat unrelated Cognito failures as a missing user", async () => {
    const denied = Object.assign(new Error("denied"), { name: "AccessDeniedException" });
    const { client, send } = clientWithResponses(denied);

    await expect(ensureCognitoInvite(client, "pool-1", "player@example.com")).rejects.toBe(denied);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
