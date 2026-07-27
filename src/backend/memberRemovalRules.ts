import type { LeagueMemberRole } from "./types";

export interface RemovalActor {
  userId: string;
  isSuperAdmin: boolean;
  isLeagueAdmin: boolean;
}

export interface RemovalTarget {
  userId: string;
  role: LeagueMemberRole;
  isSuperAdmin: boolean;
}

export function assertCanRemoveLeagueMember(actor: RemovalActor, target: RemovalTarget): void {
  if (actor.userId === target.userId) {
    throw new Error("You cannot remove yourself from a league.");
  }
  if (!actor.isSuperAdmin && !actor.isLeagueAdmin) {
    throw new Error("Unauthorized.");
  }
  if (target.isSuperAdmin) {
    throw new Error("Super admins cannot be removed from a league.");
  }
  if (!actor.isSuperAdmin && target.role === "league_admin") {
    throw new Error("Only a super admin can remove a league admin.");
  }
}
