import { useMemo, useState, type ReactElement } from "react";
import { avatarGradient, avatarInitials, gravatarUrl } from "./avatar-util.js";

export type AvatarProps = {
  readonly name: string;
  readonly email?: string | undefined;
  readonly size?: number | undefined;
};

/**
 * Avatar for a git author. Renders a deterministic gradient + initials, and —
 * when an email is available — overlays the person's Gravatar photo, falling
 * back to the generated avatar if none exists / offline (`d=404` → onError).
 */
export function Avatar(props: AvatarProps): ReactElement {
  const size = props.size ?? 28;
  const [photoOk, setPhotoOk] = useState(true);

  const gradient = useMemo(
    () => avatarGradient(props.email || props.name),
    [props.email, props.name],
  );

  const photoUrl = useMemo(
    () => gravatarUrl(props.email, size),
    [props.email, size],
  );

  const showPhoto = photoUrl !== null && photoOk;

  return (
    <span
      className="ov-avatar"
      style={{ width: size, height: size, backgroundImage: gradient }}
      title={props.name}
      aria-label={props.name}
    >
      {showPhoto ? (
        <img
          src={photoUrl ?? undefined}
          alt=""
          width={size}
          height={size}
          onError={() => setPhotoOk(false)}
        />
      ) : (
        <span className="ov-avatar__initials">
          {avatarInitials(props.name)}
        </span>
      )}
    </span>
  );
}
