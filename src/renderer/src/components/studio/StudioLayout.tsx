import { useState } from 'react';
import { HistorySidebar } from '@renderer/components/studio/HistorySidebar';
import { ChatPanel } from '@renderer/components/studio/ChatPanel';
import { ParameterPanel } from '@renderer/components/studio/ParameterPanel';
import { CodeExportModal } from '@renderer/components/studio/CodeExportModal';

export function StudioLayout() {
  const [isExportOpen, setIsExportOpen] = useState(false);

  return (
    <div className="flex-1 min-h-0 flex bg-zinc-950">
      <HistorySidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        <ChatPanel />
      </div>

      <ParameterPanel onOpenExportModal={() => setIsExportOpen(true)} />

      <CodeExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  );
}
