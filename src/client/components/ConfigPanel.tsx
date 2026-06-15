import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiClientError } from '../services/api';
import type { Business } from '../../shared/types/business';
import type { DaySchedule, WeeklySchedule } from '../../shared/types/common';

// ─── Constants ────────────────────────────────────────────────────────────────

const VOICE_OPTIONS = [
  { id: 'voice-en-female-1', label: 'English Female (Professional)' },
  { id: 'voice-en-male-1', label: 'English Male (Professional)' },
  { id: 'voice-en-female-2', label: 'English Female (Friendly)' },
  { id: 'voice-en-male-2', label: 'English Male (Friendly)' },
  { id: 'voice-es-female-1', label: 'Spanish Female' },
  { id: 'voice-es-male-1', label: 'Spanish Male' },
  { id: 'voice-fr-female-1', label: 'French Female' },
  { id: 'voice-zh-female-1', label: 'Mandarin Female' },
];

const DAYS: Array<{ key: keyof WeeklySchedule; label: string }> = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const MAX_BUSINESS_NAME = 100;
const MAX_GREETING = 500;

// ─── Validation ───────────────────────────────────────────────────────────────

interface ValidationErrors {
  name?: string;
  greeting?: string;
  callTimeoutSeconds?: string;
  maxConcurrentCalls?: string;
}

function validate(config: ConfigFormState): ValidationErrors {
  const errors: ValidationErrors = {};

  if (config.name.length > MAX_BUSINESS_NAME) {
    errors.name = `Business name must not exceed ${MAX_BUSINESS_NAME} characters (currently ${config.name.length})`;
  } else if (config.name.trim().length === 0) {
    errors.name = 'Business name is required';
  }

  if (config.greeting.length > MAX_GREETING) {
    errors.greeting = `Greeting must not exceed ${MAX_GREETING} characters (currently ${config.greeting.length})`;
  } else if (config.greeting.trim().length === 0) {
    errors.greeting = 'Greeting message is required';
  }

  if (config.callTimeoutSeconds < 1 || !Number.isInteger(config.callTimeoutSeconds)) {
    errors.callTimeoutSeconds = 'Call timeout must be a positive whole number';
  }

  if (config.maxConcurrentCalls < 1 || !Number.isInteger(config.maxConcurrentCalls)) {
    errors.maxConcurrentCalls = 'Max concurrent calls must be a positive whole number';
  }

  return errors;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfigFormState {
  name: string;
  greeting: string;
  voiceProfileId: string;
  operatingHours: {
    timezone: string;
    schedule: WeeklySchedule;
  };
  callTimeoutSeconds: number;
  maxConcurrentCalls: number;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '720px',
  },
  heading: {
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '24px',
    color: '#1a1a2e',
  },
  field: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: '100px',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  },
  errorText: {
    color: '#ef4444',
    fontSize: '12px',
    marginTop: '4px',
  },
  charCount: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
    textAlign: 'right',
  },
  charCountWarning: {
    color: '#f59e0b',
  },
  charCountError: {
    color: '#ef4444',
  },
  hoursGrid: {
    display: 'grid',
    gap: '8px',
  },
  dayRow: {
    display: 'grid',
    gridTemplateColumns: '120px 60px 130px 130px',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 0',
  },
  dayLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  timeInput: {
    padding: '6px 8px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    outline: 'none',
  },
  smallInput: {
    width: '120px',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  buttonRow: {
    marginTop: '28px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  saveButton: {
    padding: '10px 24px',
    backgroundColor: '#6366f1',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  saveButtonDisabled: {
    backgroundColor: '#a5b4fc',
    cursor: 'not-allowed',
  },
  successMessage: {
    color: '#16a34a',
    fontSize: '14px',
    fontWeight: 500,
  },
  apiError: {
    color: '#ef4444',
    fontSize: '14px',
    fontWeight: 500,
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: '#6b7280',
    fontSize: '16px',
  },
  loadErrorContainer: {
    padding: '24px',
    backgroundColor: '#fef2f2',
    borderRadius: '8px',
    color: '#991b1b',
    fontSize: '14px',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConfigPanel() {
  const [config, setConfig] = useState<ConfigFormState | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // ─── Load config ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await apiClient.get<Business>('/config');
        const biz = response.data;
        setConfig({
          name: biz.name,
          greeting: biz.greeting,
          voiceProfileId: biz.voiceProfileId,
          operatingHours: biz.operatingHours,
          callTimeoutSeconds: biz.callTimeoutSeconds,
          maxConcurrentCalls: biz.maxConcurrentCalls,
        });
      } catch (err) {
        if (err instanceof ApiClientError) {
          setLoadError(err.message);
        } else {
          setLoadError('Failed to load configuration');
        }
      } finally {
        setIsLoadingConfig(false);
      }
    }

    loadConfig();
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleFieldChange = useCallback(
    (field: keyof ConfigFormState, value: string | number) => {
      setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
      setSaveSuccess(false);
      setApiError(null);
    },
    []
  );

  const handleDayScheduleChange = useCallback(
    (day: keyof WeeklySchedule, updates: Partial<DaySchedule>) => {
      setConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          operatingHours: {
            ...prev.operatingHours,
            schedule: {
              ...prev.operatingHours.schedule,
              [day]: { ...prev.operatingHours.schedule[day], ...updates },
            },
          },
        };
      });
      setSaveSuccess(false);
      setApiError(null);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!config) return;

    const errors = validate(config);
    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);
    setApiError(null);

    try {
      await apiClient.put<Business>('/config', {
        name: config.name,
        greeting: config.greeting,
        voiceProfileId: config.voiceProfileId,
        operatingHours: config.operatingHours,
        callTimeoutSeconds: config.callTimeoutSeconds,
        maxConcurrentCalls: config.maxConcurrentCalls,
      });
      setSaveSuccess(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setApiError(err.message);
      } else {
        setApiError('Failed to save configuration. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  }, [config]);

  // Validate on change for inline errors
  useEffect(() => {
    if (config) {
      const errors = validate(config);
      setValidationErrors(errors);
    }
  }, [config]);

  // ─── Loading / Error states ───────────────────────────────────────────────

  if (isLoadingConfig) {
    return (
      <div style={styles.loadingContainer} role="status" aria-live="polite">
        Loading configuration…
      </div>
    );
  }

  if (loadError || !config) {
    return (
      <div style={styles.loadErrorContainer} role="alert">
        <p>{loadError || 'Unable to load configuration.'}</p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const hasErrors = Object.keys(validationErrors).length > 0;
  const greetingCharCount = config.greeting.length;

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Configuration</h2>

      {/* Business Name */}
      <div style={styles.field}>
        <label htmlFor="config-name" style={styles.label}>
          Business Name
        </label>
        <input
          id="config-name"
          type="text"
          value={config.name}
          onChange={(e) => handleFieldChange('name', e.target.value)}
          style={{
            ...styles.input,
            ...(validationErrors.name ? styles.inputError : {}),
          }}
          maxLength={MAX_BUSINESS_NAME + 10}
          aria-describedby={`config-name-count${validationErrors.name ? ' config-name-error' : ''}`}
          aria-invalid={!!validationErrors.name}
        />
        <p
          id="config-name-count"
          style={{
            ...styles.charCount,
            ...(config.name.length > MAX_BUSINESS_NAME
              ? styles.charCountError
              : config.name.length > MAX_BUSINESS_NAME * 0.9
                ? styles.charCountWarning
                : {}),
          }}
          aria-live="polite"
        >
          {config.name.length}/{MAX_BUSINESS_NAME} characters
        </p>
        {validationErrors.name && (
          <p id="config-name-error" style={styles.errorText} role="alert">
            {validationErrors.name}
          </p>
        )}
      </div>

      {/* Greeting Message */}
      <div style={styles.field}>
        <label htmlFor="config-greeting" style={styles.label}>
          Greeting Message
        </label>
        <textarea
          id="config-greeting"
          value={config.greeting}
          onChange={(e) => handleFieldChange('greeting', e.target.value)}
          style={{
            ...styles.textarea,
            ...(validationErrors.greeting ? styles.inputError : {}),
          }}
          aria-describedby="config-greeting-count config-greeting-error"
          aria-invalid={!!validationErrors.greeting}
        />
        <p
          id="config-greeting-count"
          style={{
            ...styles.charCount,
            ...(greetingCharCount > MAX_GREETING
              ? styles.charCountError
              : greetingCharCount > MAX_GREETING * 0.9
                ? styles.charCountWarning
                : {}),
          }}
          aria-live="polite"
        >
          {greetingCharCount}/{MAX_GREETING} characters
        </p>
        {validationErrors.greeting && (
          <p id="config-greeting-error" style={styles.errorText} role="alert">
            {validationErrors.greeting}
          </p>
        )}
      </div>

      {/* Voice Selection */}
      <div style={styles.field}>
        <label htmlFor="config-voice" style={styles.label}>
          Voice Profile
        </label>
        <select
          id="config-voice"
          value={config.voiceProfileId}
          onChange={(e) => handleFieldChange('voiceProfileId', e.target.value)}
          style={styles.select}
        >
          {VOICE_OPTIONS.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.label}
            </option>
          ))}
        </select>
      </div>

      {/* Operating Hours */}
      <div style={styles.field}>
        <span style={styles.label}>Operating Hours</span>
        <div style={styles.hoursGrid} role="group" aria-label="Operating hours by day">
          {DAYS.map(({ key, label }) => {
            const day = config.operatingHours.schedule[key];
            return (
              <div key={key} style={styles.dayRow}>
                <span style={styles.dayLabel}>{label}</span>
                <input
                  type="checkbox"
                  checked={day.isOpen}
                  onChange={(e) =>
                    handleDayScheduleChange(key, { isOpen: e.target.checked })
                  }
                  style={styles.checkbox}
                  aria-label={`${label} open`}
                />
                <input
                  type="time"
                  value={day.openTime}
                  onChange={(e) =>
                    handleDayScheduleChange(key, { openTime: e.target.value })
                  }
                  disabled={!day.isOpen}
                  style={{
                    ...styles.timeInput,
                    opacity: day.isOpen ? 1 : 0.4,
                  }}
                  aria-label={`${label} open time`}
                />
                <input
                  type="time"
                  value={day.closeTime}
                  onChange={(e) =>
                    handleDayScheduleChange(key, { closeTime: e.target.value })
                  }
                  disabled={!day.isOpen}
                  style={{
                    ...styles.timeInput,
                    opacity: day.isOpen ? 1 : 0.4,
                  }}
                  aria-label={`${label} close time`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Call Timeout */}
      <div style={styles.field}>
        <label htmlFor="config-timeout" style={styles.label}>
          Call Timeout (seconds)
        </label>
        <input
          id="config-timeout"
          type="number"
          min={1}
          value={config.callTimeoutSeconds}
          onChange={(e) =>
            handleFieldChange('callTimeoutSeconds', parseInt(e.target.value, 10) || 0)
          }
          style={{
            ...styles.smallInput,
            ...(validationErrors.callTimeoutSeconds ? styles.inputError : {}),
          }}
          aria-describedby={
            validationErrors.callTimeoutSeconds ? 'config-timeout-error' : undefined
          }
          aria-invalid={!!validationErrors.callTimeoutSeconds}
        />
        {validationErrors.callTimeoutSeconds && (
          <p id="config-timeout-error" style={styles.errorText} role="alert">
            {validationErrors.callTimeoutSeconds}
          </p>
        )}
      </div>

      {/* Max Concurrent Calls */}
      <div style={styles.field}>
        <label htmlFor="config-max-calls" style={styles.label}>
          Max Concurrent Calls
        </label>
        <input
          id="config-max-calls"
          type="number"
          min={1}
          value={config.maxConcurrentCalls}
          onChange={(e) =>
            handleFieldChange('maxConcurrentCalls', parseInt(e.target.value, 10) || 0)
          }
          style={{
            ...styles.smallInput,
            ...(validationErrors.maxConcurrentCalls ? styles.inputError : {}),
          }}
          aria-describedby={
            validationErrors.maxConcurrentCalls ? 'config-max-calls-error' : undefined
          }
          aria-invalid={!!validationErrors.maxConcurrentCalls}
        />
        {validationErrors.maxConcurrentCalls && (
          <p id="config-max-calls-error" style={styles.errorText} role="alert">
            {validationErrors.maxConcurrentCalls}
          </p>
        )}
      </div>

      {/* Save Button */}
      <div style={styles.buttonRow}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || hasErrors}
          style={{
            ...styles.saveButton,
            ...(isSaving || hasErrors ? styles.saveButtonDisabled : {}),
          }}
          aria-busy={isSaving}
        >
          {isSaving ? 'Saving…' : 'Save Configuration'}
        </button>

        {saveSuccess && (
          <span style={styles.successMessage} role="status" aria-live="polite">
            Configuration saved successfully.
          </span>
        )}

        {apiError && (
          <span style={styles.apiError} role="alert" aria-live="assertive">
            {apiError}
          </span>
        )}
      </div>
    </div>
  );
}
