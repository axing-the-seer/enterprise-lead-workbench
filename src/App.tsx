import { CRM } from "@/components/atomic-crm/root/CRM";
import { FindCompaniesPage } from "@/components/enterprise-workbench/FindCompaniesPage";
import { WorkbenchLayout } from "@/components/enterprise-workbench/WorkbenchLayout";
import { workbenchI18nProvider } from "@/components/enterprise-workbench/i18nProvider";

/**
 * Application entry point
 *
 * Production entry point. The inherited CRM shell remains an implementation
 * detail; the user-facing product is the enterprise list workbench.
 */
const App = () => (
  <CRM
    title="企业名单工作台"
    darkModeLogo="/appIcon/512.png"
    lightModeLogo="/appIcon/512.png"
    dashboard={FindCompaniesPage}
    layout={WorkbenchLayout}
    i18nProvider={workbenchI18nProvider}
    disableTelemetry
  />
);

export default App;
