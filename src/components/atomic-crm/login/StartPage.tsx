import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";
import { Navigate, useLocation } from "react-router-dom";
import { getSafeLoginRedirect } from "@/lib/authRoute";

import type { CrmDataProvider } from "../providers/types";
import { LoginSkeleton } from "./LoginSkeleton";
import { LoginPage } from "./LoginPage";
import { disableEmailPasswordAuthentication } from "./authConfig";

export const StartPage = (props: { redirectTo?: string }) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const location = useLocation();
  const redirectTo = props.redirectTo ?? getSafeLoginRedirect(location.search);
  const {
    data: isInitialized,
    error,
    isPending,
  } = useQuery({
    queryKey: ["init"],
    queryFn: async () => {
      return dataProvider.isInitialized();
    },
  });

  if (isPending) return <LoginSkeleton />;
  if (error) return <LoginPage redirectTo={redirectTo} />;
  if (isInitialized) return <LoginPage redirectTo={redirectTo} />;
  if (disableEmailPasswordAuthentication)
    return <LoginPage redirectTo={redirectTo} />;

  return <Navigate to="/sign-up" />;
};
