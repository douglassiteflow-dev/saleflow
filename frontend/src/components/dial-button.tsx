import { useState } from "react";
import { useDial, useHangup, useTelavoxStatus } from "@/api/telavox";
import { Button } from "@/components/ui/button";

interface DialButtonProps {
  leadId: string;
  phone: string;
}

export function DialButton({ leadId, phone }: DialButtonProps) {
  const { data: status } = useTelavoxStatus();
  const dial = useDial();
  const hangup = useHangup();
  const [calling, setCalling] = useState(false);

  if (!status?.connected) return null;
  if (!phone) return null;

  function handleDial() {
    dial.mutate(leadId, { onSuccess: () => setCalling(true) });
  }

  function handleHangup() {
    hangup.mutate(undefined, { onSuccess: () => setCalling(false) });
  }

  if (calling) {
    return (
      <Button variant="danger" size="default" onClick={handleHangup} disabled={hangup.isPending}>
        {hangup.isPending ? "..." : "Lägg på"}
      </Button>
    );
  }

  return (
    <Button variant="primary" size="default" onClick={handleDial} disabled={dial.isPending}>
      {dial.isPending ? "Ringer..." : "Ring"}
    </Button>
  );
}
