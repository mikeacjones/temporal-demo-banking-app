import type { Settings, StepStatus, TransferEvent } from '../types'

interface WorkflowDiagramProps {
  events: TransferEvent[]
  settings: Settings
  finalStatus: string | null
  temporalWorkflowUrl?: string | null
}

interface StepDef {
  key: string
  label: string
  service: string
  icon: string
  conditionalScenario?: string
}

const WORKFLOW_STEPS: StepDef[] = [
  { key: 'validate', label: 'Validate Transfer', service: 'Bank Service', icon: '\u{1F50D}' },
  { key: 'withdraw', label: 'Withdraw Funds', service: 'Bank Service', icon: '\u{1F3E6}' },
  { key: 'approval_wait', label: 'Await Approval', service: 'Signal (Human)', icon: '\u{1F464}', conditionalScenario: 'human_in_the_loop' },
  { key: 'deposit', label: 'Deposit Funds', service: 'Bank Service', icon: '\u{1F4B0}' },
  { key: 'send_notification_success', label: 'Send Notification', service: 'Notification', icon: '\u{1F4F1}' },
]

const COMPENSATION_STEPS: StepDef[] = [
  { key: 'undo_withdraw', label: 'Undo Withdrawal', service: 'Bank Service', icon: '\u{21A9}\u{FE0F}' },
  { key: 'send_notification_failure', label: 'Notify Failure', service: 'Notification', icon: '\u{1F4F1}' },
]

function getStepState(stepKey: string, events: TransferEvent[]) {
  const stepEvents = events.filter((e) => e.step === stepKey)
  if (stepEvents.length === 0) return { status: 'pending' as StepStatus, events: [], last: undefined }
  const last = stepEvents[stepEvents.length - 1]
  return { status: last.status, events: stepEvents, last }
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'border-gray-600 bg-gray-700/50',
  running: 'border-blue-500 bg-blue-500/10',
  completed: 'border-green-500 bg-green-500/10',
  failed: 'border-red-500 bg-red-500/10',
  retrying: 'border-yellow-500 bg-yellow-500/10',
}

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-gray-500',
  running: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  retrying: 'bg-yellow-500 animate-pulse',
}

const STATUS_LINE: Record<string, string> = {
  pending: 'bg-gray-600',
  completed: 'bg-green-500',
}

export function WorkflowDiagram({
  events,
  settings,
  finalStatus,
  temporalWorkflowUrl,
}: WorkflowDiagramProps) {
  const isDetailed = settings.presentation_mode === 'detailed'
  const showCompensation = events.some((e) =>
    COMPENSATION_STEPS.some((cs) => cs.key === e.step)
  )

  const visibleSteps = WORKFLOW_STEPS.filter(
    (s) => !s.conditionalScenario || s.conditionalScenario === settings.scenario
  )

  return (
    <div className="space-y-1">
      {/* Mode badge */}
      <div className="mb-3">
        <a
          href={temporalWorkflowUrl || undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!temporalWorkflowUrl}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-colors ${
            temporalWorkflowUrl
              ? 'hover:bg-purple-500/30 hover:text-purple-100 cursor-pointer'
              : 'cursor-default'
          }`}
          onClick={(event) => {
            if (!temporalWorkflowUrl) event.preventDefault()
          }}
          title={
            temporalWorkflowUrl
              ? 'Open this workflow in Temporal UI'
              : 'Start a transfer to open the workflow'
          }
        >
          Temporal Workflow
        </a>
      </div>

      {/* Main steps */}
      {visibleSteps.map((step, i) => {
        const state = getStepState(step.key, events)
        const isLast = i === visibleSteps.length - 1

        return (
          <div key={step.key}>
            <div
              className={`rounded-lg border-2 p-3 transition-all duration-300 ${STATUS_COLORS[state.status]}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[state.status]}`}
                />
                <span className="text-lg">{step.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200">{step.label}</p>
                  <p className="text-xs text-gray-400">{step.service}</p>
                </div>
                {step.key === 'approval_wait' && state.status === 'pending' && (
                  <span className="text-xs text-gray-500 italic">signal</span>
                )}
              </div>

              {isDetailed && state.last && (
                <div className="mt-2 ml-8 text-xs space-y-0.5">
                  {state.last.detail && (
                    <p className="text-gray-300">{state.last.detail}</p>
                  )}
                  {state.last.error && (
                    <p className="text-red-400 font-mono">{state.last.error}</p>
                  )}
                  {state.last.attempt > 1 && (
                    <p className="text-yellow-400">
                      Attempt {state.last.attempt}/{state.last.max_attempts}
                    </p>
                  )}
                </div>
              )}

              {state.status === 'retrying' && state.last && !isDetailed && (
                <div className="mt-1.5 ml-8">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-300">
                    Retry {state.last.attempt}/{state.last.max_attempts}
                  </span>
                </div>
              )}
            </div>

            {!isLast && (
              <div className="flex justify-center py-0.5">
                <div
                  className={`w-0.5 h-4 ${STATUS_LINE[state.status === 'pending' ? 'pending' : 'completed']}`}
                />
              </div>
            )}
          </div>
        )
      })}

      {/* Compensation branch */}
      {showCompensation && (
        <>
          <div className="flex justify-center py-1">
            <div className="w-0.5 h-4 bg-red-500" />
          </div>
          <div className="ml-4 border-l-2 border-dashed border-red-500/50 pl-3 space-y-1">
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
              Compensation (Saga)
            </p>
            {COMPENSATION_STEPS.map((step) => {
              const state = getStepState(step.key, events)
              if (state.status === 'pending') return null
              return (
                <div
                  key={step.key}
                  className={`rounded-lg border-2 p-3 transition-all duration-300 ${STATUS_COLORS[state.status]}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[state.status]}`}
                    />
                    <span className="text-lg">{step.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-200">{step.label}</p>
                      <p className="text-xs text-gray-400">{step.service}</p>
                    </div>
                  </div>
                  {isDetailed && state.last?.detail && (
                    <p className="mt-1 ml-8 text-xs text-gray-300">{state.last.detail}</p>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Final status banner */}
      {finalStatus === 'completed' && (
        <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
          <p className="text-green-300 font-bold text-sm">Transfer completed successfully</p>
        </div>
      )}
      {finalStatus === 'failed' && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
          <p className="text-red-300 font-bold text-sm">Transfer failed</p>
        </div>
      )}
      {finalStatus === 'reversed' && (
        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
          <p className="text-yellow-300 font-bold text-sm">Withdrawal reversed — funds returned</p>
        </div>
      )}
    </div>
  )
}
