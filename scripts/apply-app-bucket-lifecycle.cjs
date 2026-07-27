const { execFileSync } = require("node:child_process");

const prefix = process.env.APP_BUCKET_PREFIX ?? "pickem-bot-v1-run2";
const expirationDays = Number(process.env.APP_LOG_BUCKET_EXPIRATION_DAYS ?? "15");

function main() {
  const buckets = JSON.parse(execFileSync("aws", ["s3api", "list-buckets", "--output", "json"], { encoding: "utf8" })).Buckets ?? [];
  const eligible = buckets.filter((bucket) => bucket.Name && isAppBucket(bucket.Name));

  for (const bucket of eligible) {
    const lifecycle = {
      Rules: [
        {
          ID: `${prefix}-log-expire-${expirationDays}-days`,
          Status: "Enabled",
          Filter: {},
          Expiration: { Days: expirationDays },
          NoncurrentVersionExpiration: { NoncurrentDays: expirationDays }
        }
      ]
    };
    execFileSync("aws", [
      "s3api",
      "put-bucket-lifecycle-configuration",
      "--bucket",
      bucket.Name,
      "--lifecycle-configuration",
      JSON.stringify(lifecycle)
    ], { stdio: "inherit" });
    console.log(`Applied ${expirationDays}-day lifecycle to ${bucket.Name}.`);
  }

  if (!eligible.length) {
    console.log(`No app-owned buckets matched ${prefix}; no lifecycle changes made.`);
  }
}

function isAppBucket(bucketName) {
  if (bucketName.includes(prefix) && looksLikeLogBucket(bucketName)) {
    return true;
  }
  try {
    const tags = JSON.parse(execFileSync("aws", ["s3api", "get-bucket-tagging", "--bucket", bucketName, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).TagSet ?? [];
    const tagMap = new Map(tags.map((tag) => [tag.Key, tag.Value]));
    const appTagged = [tagMap.get("Project"), tagMap.get("Application"), tagMap.get("app"), tagMap.get("Name")]
      .some((value) => typeof value === "string" && value.includes(prefix));
    return appTagged && looksLikeLogBucket(bucketName);
  } catch {
    return false;
  }
}

function looksLikeLogBucket(bucketName) {
  const normalized = bucketName.toLowerCase();
  return normalized.includes("log") || normalized.includes("cloudtrail") || normalized.includes("trail");
}

main();
