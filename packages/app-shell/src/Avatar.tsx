import { useMemo, useState, type ReactElement } from "react";
import { avatarGradient, avatarInitials, gravatarUrl } from "./avatar-util.js";
import { useConsentGranted } from "./consent-state.js";

export type AvatarProps = {
  readonly name: string;
  readonly email?: string | undefined;
  readonly size?: number | undefined;
};

/**
 * Avatar for a git author: a deterministic gradient and initials, drawn
 * locally with no request.
 *
 * The real Gravatar photo is overlaid only when `network.gravatar` has been
 * granted (M-036 F3). Until M-036 this fetched from gravatar.com
 * unconditionally, behind no toggle at all — an unannounced third-party
 * request disclosing who works on the repository, from a product whose
 * headline claim is local-first.
 */
export function Avatar(props: AvatarProps): ReactElement {
  const size = props.size ?? 28;
  const [photoOk, setPhotoOk] = useState(true);
  const gravatarAllowed = useConsentGranted("network.gravatar");

  const gradient = useMemo(
    () => avatarGradient(props.email || props.name),
    [props.email, props.name],
  );

  const photoUrl = useMemo(
    () => (gravatarAllowed ? gravatarUrl(props.email, size) : null),
    [gravatarAllowed, props.email, size],
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
