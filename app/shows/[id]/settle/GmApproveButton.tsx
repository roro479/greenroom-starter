"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { approveSettlementAction } from "./actions";
import { useRouter } from "next/navigation";

export default function GmApproveButton({
  showId,
  alreadyApproved,
}: {
  showId: string;
  alreadyApproved: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyApproved) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[12px] text-brand-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        GM approved
      </div>
    );
  }

  async function handleApprove() {
    setLoading(true);
    setError(null);
    const result = await approveSettlementAction(showId);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={handleApprove}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 text-white text-[12.5px] font-medium hover:bg-brand-800 disabled:opacity-60 transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Approving…
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" />
            GM Approve
          </>
        )}
      </button>
      {error && (
        <div className="text-[11.5px] text-rose-600 mt-1">{error}</div>
      )}
    </div>
  );
}
