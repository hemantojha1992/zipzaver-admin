import { AgreementsView } from "@/components/modules/read-only-view";
import { REQUIRED_RIDER_AGREEMENT_SHA256, REQUIRED_RIDER_AGREEMENT_VERSION } from "@/canonical/contract";
export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { cursor } = await searchParams;
  return <><section className="panel"><h2>Required agreement metadata</h2><dl><dt>Required version</dt><dd>{REQUIRED_RIDER_AGREEMENT_VERSION}</dd><dt>SHA-256</dt><dd className="long-id">{REQUIRED_RIDER_AGREEMENT_SHA256}</dd><dt>Approved language</dt><dd>English (en) only</dd><dt>Administration</dt><dd>Acceptance records are immutable and read-only. Version and hash must both match; historical v1 acceptance remains visible but stale.</dd></dl></section><AgreementsView cursor={cursor}/></>;
}
