import type { JobEstimateMaterialSnapshot, JobEstimateLaborSnapshot } from '@/domain/jobs/types';

export function JobQuotePlan({materials, labour, hours}: {
  materials: JobEstimateMaterialSnapshot[];
  labour: JobEstimateLaborSnapshot[];
  hours: number;
}) {
  if (!materials.length && !labour.length && !hours) return null;
  const parts = [...new Set([...materials, ...labour].map(line => line.sectionName?.trim() || 'General'))];
  return <section className="job-organizer" aria-label="Planned materials and labour">
    <h2>Planned materials &amp; labour</h2>
    <p>{materials.length} material lines · {hours} estimated hours</p>
    <p>Carried over from the quote. Record materials used and hours worked separately in Actuals.</p>
    <div className="job-parts-grid">{parts.map(part => {
      const partMaterials = materials.filter(line => (line.sectionName?.trim() || 'General') === part);
      const partLabour = labour.filter(line => (line.sectionName?.trim() || 'General') === part);
      return <details className="job-part-card" key={part}>
        <summary><strong>{part}</strong><div>{partMaterials.length} material lines · {partLabour.reduce((sum, line) => sum + line.quantity, 0)} planned hours</div></summary>
        {partMaterials.length > 0 && <><h3>Materials</h3><ul>{partMaterials.map((line, index) => <li key={index}>{line.quantity} {line.unit} — {line.description}</li>)}</ul></>}
        {partLabour.length > 0 && <><h3>Labour</h3><ul>{partLabour.map((line, index) => <li key={index}>{line.quantity} {line.unit} — {line.description}</li>)}</ul></>}
      </details>;
    })}</div>
  </section>;
}
