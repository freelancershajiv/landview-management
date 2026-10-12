import "./project-finance-redesign.css";
import "./project-finance-navigation.css";

export default function ProjectFinanceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="pf-redesign">{children}</div>;
}
