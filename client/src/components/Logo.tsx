// MTHS official logo — transparent background, white for dark surfaces
import logoWhite from "@assets/mths-logo-white.png";
import logoDark from "@assets/mths-logo-dark.png";

export function Logo({
  className = "",
  variant = "white",
}: {
  className?: string;
  variant?: "white" | "dark";
}) {
  const src = variant === "white" ? logoWhite : logoDark;
  return (
    <img
      src={src}
      alt="My Tennessee Home Solution"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
