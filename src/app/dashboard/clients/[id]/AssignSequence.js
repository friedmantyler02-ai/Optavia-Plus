"use client";

import { useState, useEffect } from "react";
import useShowToast from "@/hooks/useShowToast";

export default function AssignSequence({ supabase, clientId, coachId, onAssigned, onClose }) {
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [alreadyAssigned, setAlreadyAssigned] = useState([]);
  const showToast = useShowToast();

  useEffect(() => {
    async function load() {
      const { data: seqs } = await supabase
        .from("touchpoint_sequences")
        .select("id, name, icon, description")
        .order("name");

      const { data: existing } = await supabase
        .from("client_touchpoints")
        .select("sequence_id")
        .eq("client_id", clientId)
        .in("status", ["active", "paused"]);

      setSequences(seqs || []);
      setAlreadyAssigned((existing || []).map((e) => e.sequence_id));
      setLoading(false);
    }
    load();
  }, [supabase, clientId]);

  async function handleAssign(sequenceId) {
    setAssigning(true);

    const { error } = await supabase.from("client_touchpoints").insert({
      client_id: clientId,
      coach_id: coachId,
      sequence_id: sequenceId,
      started_at: new Date().toISOString(),
      status: "active",
    });

    if (error) {
      console.error("Error assigning sequence:", error);
      showToast({ message: "Something went wrong — please try again", variant: "error" });
      setAssigning(false);
      return;
    }

    const seqName = sequences.find((s) => s.id === sequenceId)?.name || "sequence";
    await supabase.from("activities").insert({
      coach_id: coachId,
      client_id: clientId,
      action: "Assigned Touchpoint Sequence",
      details: `Started "${seqName}"`,
    });

    showToast({ message: "Sequence assigned", variant: "success" });
    setAssigning(false);
    if (onAssigned) onAssigned();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-xl font-extrabold" style={{ fontFamily: "Playfair Display, serif" }}>
            Assign a Sequence
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none transition-colors duration-150">
            &times;
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {sequences.map((seq) => {
                const isAssigned = alreadyAssigned.includes(seq.id);
                return (
                  <button
                    key={seq.id}
                    disabled={isAssigned || assigning}
                    onClick={() => handleAssign(seq.id)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-150 ${
                      isAssigned
                        ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                        : "border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {seq.icon && <span className="text-2xl">{seq.icon}</span>}
                      <div>
                        <div className="font-semibold text-gray-800">{seq.name}</div>
                        {isAssigned ? (
                          <span className="text-xs text-green-600 font-medium">✓ Already active</span>
                        ) : seq.description ? (
                          <span className="text-sm text-gray-500">{seq.description}</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
