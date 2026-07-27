export interface PasswordRequirement {
  id: "length" | "uppercase" | "lowercase" | "number" | "symbol";
  label: string;
  met: boolean;
}

export function passwordRequirements(password: string): PasswordRequirement[] {
  return [
    { id: "length", label: "At least 12 characters", met: password.length >= 12 },
    { id: "uppercase", label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { id: "lowercase", label: "One lowercase letter", met: /[a-z]/.test(password) },
    { id: "number", label: "One number", met: /\d/.test(password) },
    { id: "symbol", label: "One symbol", met: /[^A-Za-z0-9]/.test(password) }
  ];
}

export function passwordPolicyErrors(password: string): string[] {
  return passwordRequirements(password)
    .filter((requirement) => !requirement.met)
    .map((requirement) => requirement.label);
}

export function isValidPassword(password: string): boolean {
  return passwordPolicyErrors(password).length === 0;
}

export function friendlyPasswordError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/password/i.test(message) && /(policy|constraint|requirements|invalid|length|uppercase|lowercase|number|symbol)/i.test(message)) {
    return "Password does not meet the requirements below.";
  }
  return error instanceof Error ? error.message : "Could not set new password.";
}
