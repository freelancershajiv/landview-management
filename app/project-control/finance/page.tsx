import "../project-control.css";
import ProjectFinanceWorkspace from "./project-finance-workspace";
import HeldChequeControl from "./held-cheque-control";

export default function ProjectFinancePage() {
  return (
    <>
      <ProjectFinanceWorkspace />
      <HeldChequeControl />
    </>
  );
}
