export function Wordmark({ size = "sm", inverse = false }: { size?: "sm" | "md" | "lg" | "xl"; inverse?: boolean }) {
  const cls = ["sds-wordmark", `sds-wordmark--${size}`, inverse ? "sds-wordmark--inverse" : ""]
    .filter(Boolean)
    .join(" ");
  return <span className={cls}>Sandstone</span>;
}
