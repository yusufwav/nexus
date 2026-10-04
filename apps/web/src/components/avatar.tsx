import { initialsOf } from "@/lib/initials";

export interface AvatarProps {
  readonly name: string | null | undefined;
  /** A hosted avatar URL. user.image is null for every account today. */
  readonly image?: string | null;
  readonly size?: "sm" | "md" | "lg";
}

/**
 * AVATAR
 * ------------------------------------------------------------
 * Initials derived from the user's name, on the same glass-and-accent
 * treatment as everything else.
 *
 * `image` is already plumbed through: `user.image` exists in the
 * schema (packages/db/src/schema/auth.ts:9) and is simply null for
 * every account so far. Once uploads exist, passing `session.user.image`
 * here is all that is needed — no markup changes.
 */
export default function Avatar({ name, image, size = "md" }: AvatarProps): React.JSX.Element {
  const cls = size === "md" ? "nt-avatar" : `nt-avatar nt-avatar--${size}`;

  if (image) {
    // A user-supplied URL rather than a static asset, so next/image's
    // optimisation does not apply here.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <span className={cls} aria-hidden="true">
        <img src={image} alt="" />
      </span>
    );
  }

  return (
    <span className={cls} role="img" aria-label={name ? `${name}'s avatar` : "Account"}>
      {initialsOf(name)}
    </span>
  );
}