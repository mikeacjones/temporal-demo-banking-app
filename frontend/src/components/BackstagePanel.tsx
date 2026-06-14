import { useState } from 'react'
import type { Settings, TransferEvent } from '../types'
import { WorkflowDiagram } from './WorkflowDiagram'

interface BackstagePanelProps {
  events: TransferEvent[]
  settings: Settings
  finalStatus: string | null
  temporalWorkflowUrl?: string | null
}

export function BackstagePanel({
  events,
  settings,
  finalStatus,
  temporalWorkflowUrl,
}: BackstagePanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-gray-800 text-white px-2 py-4 rounded-l-lg shadow-lg hover:bg-gray-700 transition-colors z-10"
        title="Show Behind the Scenes"
      >
        <span className="text-xs font-mono tracking-wider [writing-mode:vertical-lr]">
          BEHIND THE SCENES
        </span>
      </button>
    )
  }

  return (
    <div className="flex-1 shrink min-w-[250px] max-w-[550px] h-full bg-gray-800 border-l border-gray-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div>
          <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
            Behind the Scenes
          </h2>
          <p className="text-xs text-purple-400 mt-0.5">Temporal Workflow</p>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-gray-500 hover:text-gray-300 text-lg"
          title="Collapse"
        >
          {'\u{2715}'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {events.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">
              Initiate a transfer to see what happens behind the scenes
            </p>
          </div>
        ) : (
          <WorkflowDiagram
            events={events}
            settings={settings}
            finalStatus={finalStatus}
            temporalWorkflowUrl={temporalWorkflowUrl}
          />
        )}
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-gray-700 flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-500" /> Pending
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" /> Running
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Done
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" /> Retrying
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Failed
        </span>
      </div>
    </div>
  )
}
