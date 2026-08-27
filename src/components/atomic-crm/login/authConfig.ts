export const disableEmailPasswordAuthentication =
  import.meta.env.VITE_DISABLE_EMAIL_PASSWORD_AUTHENTICATION === "true";

export const googleWorkplaceDomain: string | undefined = import.meta.env
  .VITE_GOOGLE_WORKPLACE_DOMAIN;

export const localSingleUserMode =
  import.meta.env.VITE_LOCAL_SINGLE_USER === "true";

export const localSingleUserEmail =
  import.meta.env.VITE_LOCAL_SINGLE_USER_EMAIL ||
  "local-admin@workbench.invalid";
