import { useCallback, useEffect, useState } from 'react'
import { AccountsList } from './components/AccountsList'
import { BackstagePanel } from './components/BackstagePanel'
import { BankOperations } from './components/BankOperations'
import { PhoneFrame } from './components/PhoneFrame'
import { SettingsModal } from './components/SettingsModal'
import { TemporalCodeView } from './components/TemporalCodeView'
import { TransferForm } from './components/TransferForm'
import { TransferReview } from './components/TransferReview'
import { TransferTracker } from './components/TransferTracker'
import { useSSE } from './hooks/useSSE'
import type {
  Account,
  CreateTransferResponse,
  DemoTab,
  PhoneScreen,
  Settings,
  TemporalUiInfo,
} from './types'

const DEFAULT_SETTINGS: Settings = {
  scenario: 'happy_path',
  presentation_mode: 'detailed',
}

const SCENARIO_LABELS: Record<string, string> = {
  happy_path: 'Happy Path',
  advanced_visibility: 'Advanced Visibility',
  human_in_the_loop: 'Human-in-the-Loop',
  api_downtime: 'API Downtime',
  bug_in_workflow: 'Bug in Workflow',
  invalid_account: 'Invalid Account',
}

function App() {
  const [tab, setTab] = useState<DemoTab>('customer')
  const [screen, setScreen] = useState<PhoneScreen>('accounts')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [fromAccount, setFromAccount] = useState('')
  const [toAccount, setToAccount] = useState('')
  const [amount, setAmount] = useState('')
  const [transferId, setTransferId] = useState<string | null>(null)
  const [isTransferring, setIsTransferring] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [temporalUi, setTemporalUi] = useState<TemporalUiInfo | null>(null)
  const [temporalWorkflowUrl, setTemporalWorkflowUrl] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { events, finalStatus, reset: resetSSE } = useSSE(transferId)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => setSettings((prev) => ({ ...prev, ...s })))
      .catch(() => {})
    fetch('/api/accounts')
      .then((r) => r.json())
      .then(setAccounts)
      .catch(() => {})
    fetch('/api/temporal-ui')
      .then((r) => r.json())
      .then((data) => {
        if (data?.namespace_url) setTemporalUi(data)
      })
      .catch(() => {})
  }, [])

  const handleSaveSettings = useCallback(
    async (newSettings: Settings) => {
      setSettings(newSettings)
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      })
      setTransferId(null)
      setTemporalWorkflowUrl(null)
      setScreen('accounts')
      setFromAccount('')
      setToAccount('')
      setAmount('')
      resetSSE()
    },
    [resetSSE]
  )

  const handleConfirmTransfer = useCallback(async () => {
    setIsTransferring(true)
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account: fromAccount,
          to_account: toAccount,
          amount: parseFloat(amount),
        }),
      })
      const data = (await res.json()) as CreateTransferResponse
      setTransferId(data.transfer_id)
      setTemporalWorkflowUrl(data.temporal_ui_url || null)
      setScreen('tracking')
    } finally {
      setIsTransferring(false)
    }
  }, [fromAccount, toAccount, amount])

  const handleNewTransfer = useCallback(() => {
    setTransferId(null)
    setTemporalWorkflowUrl(null)
    setFromAccount('')
    setToAccount('')
    setAmount('')
    setScreen('accounts')
    resetSSE()
  }, [resetSSE])

  const renderPhoneContent = () => {
    switch (screen) {
      case 'accounts':
        return <AccountsList onStartTransfer={() => setScreen('transfer')} />
      case 'transfer':
        return (
          <TransferForm
            accounts={accounts}
            fromAccount={fromAccount}
            toAccount={toAccount}
            amount={amount}
            onFromChange={setFromAccount}
            onToChange={setToAccount}
            onAmountChange={setAmount}
            onNext={() => setScreen('review')}
            onBack={() => setScreen('accounts')}
          />
        )
      case 'review':
        return (
          <TransferReview
            accounts={accounts}
            fromAccount={fromAccount}
            toAccount={toAccount}
            amount={parseFloat(amount) || 0}
            onConfirm={handleConfirmTransfer}
            onBack={() => setScreen('transfer')}
            isLoading={isTransferring}
          />
        )
      case 'tracking':
        return (
          <TransferTracker
            events={events}
            finalStatus={finalStatus}
            settings={settings}
            onNewTransfer={handleNewTransfer}
          />
        )
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('customer')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'customer'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            Customer App
          </button>
          <button
            onClick={() => setTab('operations')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'operations'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            Bank Operations
          </button>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={temporalUi?.namespace_url || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!temporalUi?.namespace_url}
            className={`text-xs px-2 py-1 rounded-full font-medium bg-purple-500/20 text-purple-300 transition-colors ${
              temporalUi?.namespace_url
                ? 'hover:bg-purple-500/30 hover:text-purple-100 cursor-pointer'
                : 'cursor-default'
            }`}
            onClick={(event) => {
              if (!temporalUi?.namespace_url) event.preventDefault()
            }}
            title={
              temporalUi?.namespace
                ? `Open ${temporalUi.namespace} in Temporal UI`
                : 'Open Temporal namespace'
            }
          >
            {SCENARIO_LABELS[settings.scenario] || settings.scenario}
          </a>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-gray-400 hover:text-gray-200 text-xl transition-colors"
            title="Demo Settings"
          >
            {'\u{2699}\u{FE0F}'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {tab === 'customer' ? (
          <div className="flex-1 flex items-stretch overflow-hidden">
            <PhoneFrame>{renderPhoneContent()}</PhoneFrame>
            <BackstagePanel
              events={events}
              settings={settings}
              finalStatus={finalStatus}
              temporalWorkflowUrl={temporalWorkflowUrl}
            />
            <div className="min-w-[33vw] flex-1 flex-shrink-0 border-l border-gray-700 overflow-hidden">
              <TemporalCodeView events={events} finalStatus={finalStatus} />
            </div>
          </div>
        ) : (
          <BankOperations settings={settings} />
        )}
      </div>

      {/* Settings modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  )
}

export default App
