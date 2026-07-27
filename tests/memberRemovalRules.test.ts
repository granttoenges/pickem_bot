import { describe, expect, it } from "vitest";
import { assertCanRemoveLeagueMember, RemovalActor, RemovalTarget } from "../src/backend/memberRemovalRules";

const superAdmin: RemovalActor = {
  userId: "super-1",
  isSuperAdmin: true,
  isLeagueAdmin: false
};

const leagueAdmin: RemovalActor = {
  userId: "admin-1",
  isSuperAdmin: false,
  isLeagueAdmin: true
};

const playerActor: RemovalActor = {
  userId: "player-actor",
  isSuperAdmin: false,
  isLeagueAdmin: false
};

const playerTarget: RemovalTarget = {
  userId: "player-1",
  role: "player",
  isSuperAdmin: false
};

const adminTarget: RemovalTarget = {
  userId: "admin-2",
  role: "league_admin",
  isSuperAdmin: false
};

describe("member removal rules", () => {
  it("allows a league admin to remove a player", () => {
    expect(() => assertCanRemoveLeagueMember(leagueAdmin, playerTarget)).not.toThrow();
  });

  it("blocks a league admin from removing another league admin", () => {
    expect(() => assertCanRemoveLeagueMember(leagueAdmin, adminTarget)).toThrow("Only a super admin");
  });

  it("allows a super admin to remove a player", () => {
    expect(() => assertCanRemoveLeagueMember(superAdmin, playerTarget)).not.toThrow();
  });

  it("allows a super admin to remove a league admin", () => {
    expect(() => assertCanRemoveLeagueMember(superAdmin, adminTarget)).not.toThrow();
  });

  it("blocks self-removal", () => {
    expect(() => assertCanRemoveLeagueMember({ ...leagueAdmin, userId: "player-1" }, playerTarget)).toThrow("yourself");
  });

  it("blocks removing a global super admin", () => {
    expect(() => assertCanRemoveLeagueMember(superAdmin, { ...adminTarget, isSuperAdmin: true })).toThrow("Super admins cannot be removed");
  });

  it("blocks non-admin actors", () => {
    expect(() => assertCanRemoveLeagueMember(playerActor, playerTarget)).toThrow("Unauthorized");
  });
});
