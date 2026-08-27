import type {
  CoreAdminProps,
  AuthProvider,
  DashboardComponent,
  LayoutComponent,
} from "ra-core";
import { CustomRoutes, localStorageStore, Resource } from "ra-core";
import { lazy, useEffect, useMemo, type ComponentType } from "react";
import { Route } from "react-router";
import { Admin } from "@/components/admin/admin";
import { ForgotPasswordPage } from "@/components/supabase/forgot-password-page";
import { SetPasswordPage } from "@/components/supabase/set-password-page";
import { OAuthConsentPage } from "@/components/supabase/oauth-consent-page";

import { SignupPage } from "../login/SignupPage";
import { ConfirmationRequired } from "../login/ConfirmationRequired";
import {
  getAuthProvider as defaultAuthProviderBuilder,
  getDataProvider as defaultDataProviderBuilder,
} from "../providers/supabase";
import {
  CONFIGURATION_STORE_KEY,
  type ConfigurationContextValue,
} from "./ConfigurationContext";
import type { CrmDataProvider } from "../providers/types";
import {
  defaultCompanySectors,
  defaultCurrency,
  defaultDarkModeLogo,
  defaultDealCategories,
  defaultDealPipelineStatuses,
  defaultDealStages,
  defaultLightModeLogo,
  defaultNoteStatuses,
  defaultTaskTypes,
  defaultTitle,
} from "./defaultConfiguration";
import { i18nProvider as defaulti18nProvider } from "../providers/commons/i18nProvider";
import { StartPage } from "../login/StartPage.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { WorkbenchLayout } from "@/components/enterprise-workbench/WorkbenchLayout";
import { FindCompaniesPage } from "@/components/enterprise-workbench/FindCompaniesPage";

const lazyWorkbenchPage = <
  T extends Record<string, unknown>,
  K extends keyof T,
>(
  loader: () => Promise<T>,
  exportName: K,
) =>
  lazy(async () => ({
    default: (await loader())[exportName] as ComponentType,
  }));

const MyListsPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/MyListsPage"),
  "MyListsPage",
);
const ListDetailPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/ListDetailPage"),
  "ListDetailPage",
);
const PublicReportPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/PublicReportPage"),
  "PublicReportPage",
);
const SourceConnectionsPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/SourceConnectionsPage"),
  "SourceConnectionsPage",
);
const FieldMappingsPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/FieldMappingsPage"),
  "FieldMappingsPage",
);
const RuleTemplatesPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/RuleTemplatesPage"),
  "RuleTemplatesPage",
);
const RunsPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/RunsPage"),
  "RunsPage",
);
const ConflictsPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/ConflictsPage"),
  "ConflictsPage",
);
const EnterpriseReviewPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/EnterpriseReviewPage"),
  "EnterpriseReviewPage",
);
const ExportsPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/ExportsPage"),
  "ExportsPage",
);
const WorkbenchSettingsPage = lazyWorkbenchPage(
  () => import("@/components/enterprise-workbench/WorkbenchSettingsPage"),
  "WorkbenchSettingsPage",
);

const defaultStore = localStorageStore(undefined, "EnterpriseWorkbench");

export type CRMProps = {
  dataProvider?: CrmDataProvider;
  authProvider?: AuthProvider;
  i18nProvider?: CoreAdminProps["i18nProvider"];
  disableTelemetry?: boolean;
  store?: CoreAdminProps["store"];
  dashboard?: DashboardComponent;
  layout?: LayoutComponent;
} & Partial<ConfigurationContextValue>;

/**
 * CRM Component
 *
 * This component sets up and renders the main CRM application using `ra-core`. It provides
 * default configurations and themes but allows for customization through props. The component
 * seeds the store with any custom prop values for backwards compatibility.
 *
 * @param {LabeledValue[]} companySectors - The list of company sectors used in the application.
 * @param {string} currency - The ISO 4217 currency code used to format monetary values (e.g. "USD", "EUR", "GBP").
 * @param {RaThemeOptions} darkTheme - The theme to use when the application is in dark mode.
 * @param {LabeledValue[]} dealCategories - The categories of deals used in the application.
 * @param {string[]} dealPipelineStatuses - The statuses of deals in the pipeline used in the application.
 * @param {DealStage[]} dealStages - The stages of deals used in the application.
 * @param {RaThemeOptions} lightTheme - The theme to use when the application is in light mode.
 * @param {string} darkModeLogo - Logo shown in dark mode and on the auth pages. Must be an imported asset, an absolute URL, or a data URI — never a route-relative path like "./logos/x.svg", which breaks on nested routes such as /oauth/consent (issue #291).
 * @param {string} lightModeLogo - Logo shown in light mode. Same rule as darkModeLogo: imported asset, absolute URL, or data URI only.
 * @param {NoteStatus[]} noteStatuses - The statuses of notes used in the application.
 * @param {LabeledValue[]} taskTypes - The types of tasks used in the application.
 * @param {string} title - The title of the CRM application.
 *
 * @returns {JSX.Element} The rendered CRM application.
 *
 * @example
 * // Basic usage of the CRM component
 * import { CRM } from '@/components/atomic-crm/dashboard/CRM';
 *
 * const App = () => (
 *     <CRM
 *         darkModeLogo="https://example.com/logo-dark.svg"
 *         lightModeLogo="https://example.com/logo-light.svg"
 *         title="My Custom CRM"
 *         lightTheme={{
 *             ...defaultTheme,
 *             palette: {
 *                 primary: { main: '#0000ff' },
 *             },
 *         }}
 *     />
 * );
 *
 * export default App;
 */
export const CRM = ({
  companySectors = defaultCompanySectors,
  currency = defaultCurrency,
  dealCategories = defaultDealCategories,
  dealPipelineStatuses = defaultDealPipelineStatuses,
  dealStages = defaultDealStages,
  darkModeLogo = defaultDarkModeLogo,
  lightModeLogo = defaultLightModeLogo,
  noteStatuses = defaultNoteStatuses,
  taskTypes = defaultTaskTypes,
  title = defaultTitle,
  dataProvider = defaultDataProviderBuilder(),
  authProvider = defaultAuthProviderBuilder(),
  i18nProvider = defaulti18nProvider,
  store = defaultStore,
  disableTelemetry,
  ...rest
}: CRMProps) => {
  // Seed the store with CRM prop values if not already stored
  // (backwards compatibility for prop-based config)
  useEffect(() => {
    if (!store.getItem(CONFIGURATION_STORE_KEY)) {
      store.setItem(CONFIGURATION_STORE_KEY, {
        companySectors,
        currency,
        dealCategories,
        dealPipelineStatuses,
        dealStages,
        noteStatuses,
        taskTypes,
        title,
        darkModeLogo,
        lightModeLogo,
      } satisfies ConfigurationContextValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const isMobile = useIsMobile();

  // on login, pre-fetch the configuration to avoid a flickering
  // when accessing the app for the first time
  const wrappedAuthProvider = useMemo<AuthProvider>(
    () => ({
      ...authProvider,
      login: async (params: any) => {
        const result = await authProvider.login(params);
        try {
          const config = await dataProvider.getConfiguration();
          if (Object.keys(config).length > 0) {
            store.setItem(CONFIGURATION_STORE_KEY, config);
          }
        } catch {
          // Non-critical: config will load via useConfigurationLoader
        }
        return result;
      },
      handleCallback: async (params: any) => {
        if (!authProvider.handleCallback) {
          throw new Error(
            "handleCallback is not implemented in the authProvider",
          );
        }
        const result = await authProvider.handleCallback(params);
        try {
          const config = await dataProvider.getConfiguration();
          if (Object.keys(config).length > 0) {
            store.setItem(CONFIGURATION_STORE_KEY, config);
          }
        } catch {
          // Non-critical: config will load via useConfigurationLoader
        }
        return result;
      },
      logout: async (params: any) => {
        try {
          store.removeItem(CONFIGURATION_STORE_KEY);
        } catch {
          // Ignore
        }
        return authProvider.logout(params);
      },
    }),
    [authProvider, dataProvider, store],
  );

  const ResponsiveAdmin = isMobile ? MobileAdmin : DesktopAdmin;

  return (
    <ResponsiveAdmin
      dataProvider={dataProvider}
      authProvider={wrappedAuthProvider}
      i18nProvider={i18nProvider}
      store={store}
      loginPage={StartPage}
      requireAuth
      disableTelemetry={disableTelemetry ?? true}
      {...rest}
    />
  );
};

const DesktopAdmin = (
  props: CoreAdminProps & {
    dashboard?: DashboardComponent;
    layout?: LayoutComponent;
  },
) => {
  return (
    <Admin
      layout={props.layout ?? WorkbenchLayout}
      dashboard={props.dashboard ?? FindCompaniesPage}
      {...props}
    >
      <CustomRoutes noLayout>
        <Route path={SignupPage.path} element={<SignupPage />} />
        <Route
          path={ConfirmationRequired.path}
          element={<ConfirmationRequired />}
        />
        <Route path={SetPasswordPage.path} element={<SetPasswordPage />} />
        <Route
          path={ForgotPasswordPage.path}
          element={<ForgotPasswordPage />}
        />
        <Route path={OAuthConsentPage.path} element={<OAuthConsentPage />} />
      </CustomRoutes>

      <CustomRoutes>
        <Route path="/lists" element={<MyListsPage />} />
        <Route path="/lists/:listId" element={<ListDetailPage />} />
        <Route path="/reports/:jobId" element={<PublicReportPage />} />
        <Route path="/sources" element={<SourceConnectionsPage />} />
        <Route path="/mappings" element={<FieldMappingsPage />} />
        <Route path="/rules" element={<RuleTemplatesPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/review" element={<EnterpriseReviewPage />} />
        <Route path="/conflicts" element={<ConflictsPage />} />
        <Route path="/exports" element={<ExportsPage />} />
        <Route path="/settings" element={<WorkbenchSettingsPage />} />
      </CustomRoutes>
      <Resource name="workspaces" />
      <Resource name="workspace_members" />
      <Resource name="source_connections_safe" />
      <Resource name="source_queries" />
      <Resource name="ingestion_jobs" />
      <Resource name="source_records" />
      <Resource name="source_snapshots" />
      <Resource name="field_mapping_sets" />
      <Resource name="field_mapping_versions" />
      <Resource name="companies" />
      <Resource name="company_field_facts" />
      <Resource name="company_evidence" />
      <Resource name="risk_events" />
      <Resource name="qualifications" />
      <Resource name="company_lists" />
      <Resource name="company_list_members" />
      <Resource name="company_lists_overview" />
      <Resource name="company_list_entries" />
      <Resource name="rule_sets" />
      <Resource name="rule_set_versions" />
      <Resource name="rule_runs" />
      <Resource name="rule_results" />
      <Resource name="manual_reviews" />
      <Resource name="exports" />
      <Resource name="audit_logs" />
    </Admin>
  );
};

const MobileAdmin = (
  props: CoreAdminProps & {
    dashboard?: DashboardComponent;
    layout?: LayoutComponent;
  },
) => {
  return (
    <Admin
      layout={props.layout ?? WorkbenchLayout}
      dashboard={props.dashboard ?? FindCompaniesPage}
      {...props}
    >
      <CustomRoutes noLayout>
        <Route path={SignupPage.path} element={<SignupPage />} />
        <Route
          path={ConfirmationRequired.path}
          element={<ConfirmationRequired />}
        />
        <Route path={SetPasswordPage.path} element={<SetPasswordPage />} />
        <Route
          path={ForgotPasswordPage.path}
          element={<ForgotPasswordPage />}
        />
        <Route path={OAuthConsentPage.path} element={<OAuthConsentPage />} />
      </CustomRoutes>
      <CustomRoutes>
        <Route path="/lists" element={<MyListsPage />} />
        <Route path="/lists/:listId" element={<ListDetailPage />} />
        <Route path="/reports/:jobId" element={<PublicReportPage />} />
        <Route path="/sources" element={<SourceConnectionsPage />} />
        <Route path="/mappings" element={<FieldMappingsPage />} />
        <Route path="/rules" element={<RuleTemplatesPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/review" element={<EnterpriseReviewPage />} />
        <Route path="/conflicts" element={<ConflictsPage />} />
        <Route path="/exports" element={<ExportsPage />} />
        <Route path="/settings" element={<WorkbenchSettingsPage />} />
      </CustomRoutes>
      <Resource name="workspaces" />
      <Resource name="workspace_members" />
      <Resource name="source_connections_safe" />
      <Resource name="source_queries" />
      <Resource name="ingestion_jobs" />
      <Resource name="source_records" />
      <Resource name="source_snapshots" />
      <Resource name="field_mapping_sets" />
      <Resource name="field_mapping_versions" />
      <Resource name="companies" />
      <Resource name="company_field_facts" />
      <Resource name="company_evidence" />
      <Resource name="risk_events" />
      <Resource name="qualifications" />
      <Resource name="company_lists" />
      <Resource name="company_list_members" />
      <Resource name="company_lists_overview" />
      <Resource name="company_list_entries" />
      <Resource name="rule_sets" />
      <Resource name="rule_set_versions" />
      <Resource name="rule_runs" />
      <Resource name="rule_results" />
      <Resource name="manual_reviews" />
      <Resource name="exports" />
      <Resource name="audit_logs" />
    </Admin>
  );
};
