import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { EmptyState, ErrorState } from "@/components/ui/states";
const display = (value: unknown) => { if (value === null || value === undefined) return "Unavailable"; if (typeof value === "object" && value && "toDate" in value) return (value as { toDate(): Date }).toDate().toISOString(); return typeof value === "object" ? JSON.stringify(value) : String(value); };
export async function PersistedCollection({ collection, fields, title }: { collection: string; fields: string[]; title: string }) {
  let rows: Array<{ id: string; values: string[] }> | null = null;
  try { const snapshot = await getFirebaseAdminFirestore().collection(collection).limit(50).get(); rows = snapshot.docs.map(doc => ({ id: doc.id, values: fields.map(field => display(doc.get(field))) })); } catch { rows = null; }
  if (rows === null) return <ErrorState message={`${title} could not be loaded. Retry by refreshing this page.`}/>;
  if (!rows.length) return <EmptyState title={`No ${title}`} message="The bounded emulator query confirmed zero records."/>;
  return <section className="panel"><h2>{title}</h2><div className="table-wrap"><table><caption>{title}</caption><thead><tr><th scope="col">ID</th>{fields.map(field => <th scope="col" key={field}>{field}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.id}</td>{row.values.map((value,index) => <td key={fields[index]}>{value}</td>)}</tr>)}</tbody></table></div></section>;
}
