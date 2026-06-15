import { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import type { SMSTemplate } from '../../shared/types/sms';
import type { SMSTriggerEvent, ReminderInterval } from '../../shared/types/enums';

interface TemplateFormData {
  name: string;
  body: string;
  triggerEvent: SMSTriggerEvent;
  isActive: boolean;
}

interface ReminderConfig {
  intervals: ReminderInterval[];
}

const TRIGGER_EVENTS: { value: SMSTriggerEvent; label: string }[] = [
  { value: 'missed_call', label: 'Missed Call' },
  { value: 'voicemail', label: 'Voicemail Left' },
  { value: 'lead_captured', label: 'Lead Captured' },
  { value: 'appointment_booked', label: 'Appointment Booked' },
];

const REMINDER_INTERVALS: { value: ReminderInterval; label: string }[] = [
  { value: '15min', label: '15 minutes' },
  { value: '1hour', label: '1 hour' },
  { value: '4hours', label: '4 hours' },
  { value: '24hours', label: '24 hours' },
  { value: '48hours', label: '48 hours' },
];

const MAX_BODY_LENGTH = 160;
const WARNING_THRESHOLD = 140;

const emptyForm: TemplateFormData = {
  name: '',
  body: '',
  triggerEvent: 'missed_call',
  isActive: true,
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '900px',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '16px',
    color: '#1a1a2e',
  },
  templateList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  templateItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontWeight: 600,
    fontSize: '14px',
    color: '#1a1a2e',
    marginBottom: '4px',
  },
  templateBody: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '4px',
  },
  templateMeta: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 500,
    marginLeft: '8px',
  },
  badgeActive: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  badgeInactive: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
  },
  btnEdit: {
    padding: '6px 12px',
    fontSize: '13px',
    backgroundColor: '#6366f1',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  btnDelete: {
    padding: '6px 12px',
    fontSize: '13px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  btnAdd: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#6366f1',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 500,
    marginTop: '12px',
  },
  form: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
  },
  formTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '16px',
    color: '#1a1a2e',
  },
  fieldGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: '80px',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box' as const,
  },
  charCounter: {
    fontSize: '12px',
    textAlign: 'right' as const,
    marginTop: '4px',
  },
  charCounterNormal: {
    color: '#64748b',
  },
  charCounterWarning: {
    color: '#d97706',
    fontWeight: 600,
  },
  charCounterExceeded: {
    color: '#dc2626',
    fontWeight: 700,
  },
  formActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  },
  btnSave: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  btnCancel: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#6b7280',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  error: {
    color: '#dc2626',
    fontSize: '13px',
    marginTop: '4px',
  },
  successMsg: {
    padding: '10px 16px',
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderRadius: '6px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  errorMsg: {
    padding: '10px 16px',
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    borderRadius: '6px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  deleteConfirm: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  deleteConfirmText: {
    flex: 1,
    fontSize: '14px',
    color: '#991b1b',
  },
  reminderSection: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  emptyState: {
    padding: '24px',
    textAlign: 'center' as const,
    color: '#64748b',
    fontSize: '14px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px dashed #cbd5e1',
  },
  loading: {
    padding: '24px',
    textAlign: 'center' as const,
    color: '#64748b',
    fontSize: '14px',
  },
};

export default function SMSTemplateEditor() {
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Reminder intervals
  const [reminderIntervals, setReminderIntervals] = useState<ReminderInterval[]>([]);
  const [savingReminders, setSavingReminders] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchReminderConfig();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<any>('/sms/templates');
      const data = response.data;
      setTemplates(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : Array.isArray(data?.templates) ? data.templates : []);
    } catch (err) {
      setError('Failed to load SMS templates');
    } finally {
      setLoading(false);
    }
  }

  async function fetchReminderConfig() {
    try {
      const response = await apiClient.get<ReminderConfig>('/sms/reminders');
      setReminderIntervals(response.data.intervals);
    } catch {
      // Non-critical — use empty defaults
    }
  }

  function openAddForm() {
    setEditingId(null);
    setFormData(emptyForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(template: SMSTemplate) {
    setEditingId(template.id);
    setFormData({
      name: template.name,
      body: template.body,
      triggerEvent: template.triggerEvent,
      isActive: template.isActive,
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
    setFormError(null);
  }

  function validateForm(): string | null {
    if (!formData.name.trim()) {
      return 'Template name is required';
    }
    if (!formData.body.trim()) {
      return 'Template body is required';
    }
    if (formData.body.length > MAX_BODY_LENGTH) {
      return `Template body must not exceed ${MAX_BODY_LENGTH} characters`;
    }
    return null;
  }

  async function handleSave() {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);
    setError(null);
    setSuccess(null);

    try {
      if (editingId) {
        await apiClient.put(`/sms/templates/${editingId}`, formData);
        setSuccess('Template updated successfully');
      } else {
        await apiClient.post('/sms/templates', formData);
        setSuccess('Template created successfully');
      }
      closeForm();
      await fetchTemplates();
    } catch (err) {
      setFormError(editingId ? 'Failed to update template' : 'Failed to create template');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setSuccess(null);
    try {
      await apiClient.delete(`/sms/templates/${id}`);
      setDeletingId(null);
      setSuccess('Template deleted successfully');
      await fetchTemplates();
    } catch {
      setError('Failed to delete template');
    }
  }

  async function handleReminderToggle(interval: ReminderInterval) {
    const updated = reminderIntervals.includes(interval)
      ? reminderIntervals.filter((i) => i !== interval)
      : [...reminderIntervals, interval];

    setReminderIntervals(updated);
    setSavingReminders(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.put('/sms/reminders', { intervals: updated });
      setSuccess('Reminder intervals updated');
    } catch {
      // Revert on failure
      setReminderIntervals(reminderIntervals);
      setError('Failed to update reminder intervals');
    } finally {
      setSavingReminders(false);
    }
  }

  function getCharCounterStyle(): React.CSSProperties {
    const len = formData.body.length;
    if (len > MAX_BODY_LENGTH) {
      return { ...styles.charCounter, ...styles.charCounterExceeded };
    }
    if (len >= WARNING_THRESHOLD) {
      return { ...styles.charCounter, ...styles.charCounterWarning };
    }
    return { ...styles.charCounter, ...styles.charCounterNormal };
  }

  return (
    <div style={styles.container}>
      {/* Status Messages */}
      {success && (
        <div style={styles.successMsg} role="status" aria-live="polite">
          {success}
        </div>
      )}
      {error && (
        <div style={styles.errorMsg} role="alert">
          {error}
        </div>
      )}

      {/* SMS Templates Section */}
      <section style={styles.section} aria-labelledby="templates-heading">
        <h2 id="templates-heading" style={styles.sectionTitle}>
          SMS Templates
        </h2>

        {loading ? (
          <div style={styles.loading}>Loading templates...</div>
        ) : (
          <>
            {/* Template Form */}
            {showForm && (
              <div style={styles.form} role="form" aria-label={editingId ? 'Edit SMS template' : 'Add SMS template'}>
                <h3 style={styles.formTitle}>
                  {editingId ? 'Edit Template' : 'New Template'}
                </h3>

                <div style={styles.fieldGroup}>
                  <label htmlFor="template-name" style={styles.label}>
                    Template Name
                  </label>
                  <input
                    id="template-name"
                    type="text"
                    style={styles.input}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Missed Call Follow-up"
                    aria-required="true"
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label htmlFor="template-body" style={styles.label}>
                    Message Body
                  </label>
                  <textarea
                    id="template-body"
                    style={{
                      ...styles.textarea,
                      borderColor: formData.body.length > MAX_BODY_LENGTH ? '#dc2626' : '#d1d5db',
                    }}
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    placeholder="Enter SMS message (max 160 characters)"
                    aria-required="true"
                    aria-describedby="char-counter"
                    maxLength={MAX_BODY_LENGTH + 10} // Allow slight overage for visibility
                  />
                  <div id="char-counter" style={getCharCounterStyle()} aria-live="polite">
                    {formData.body.length}/{MAX_BODY_LENGTH} characters
                    {formData.body.length > MAX_BODY_LENGTH && ' — exceeds limit'}
                  </div>
                </div>

                <div style={styles.fieldGroup}>
                  <label htmlFor="trigger-event" style={styles.label}>
                    Trigger Event
                  </label>
                  <select
                    id="trigger-event"
                    style={styles.select}
                    value={formData.triggerEvent}
                    onChange={(e) =>
                      setFormData({ ...formData, triggerEvent: e.target.value as SMSTriggerEvent })
                    }
                  >
                    {TRIGGER_EVENTS.map((event) => (
                      <option key={event.value} value={event.value}>
                        {event.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      style={styles.checkbox}
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    Active
                  </label>
                </div>

                {formError && (
                  <div style={styles.error} role="alert">
                    {formError}
                  </div>
                )}

                <div style={styles.formActions}>
                  <button
                    type="button"
                    style={styles.btnSave}
                    onClick={handleSave}
                    disabled={saving}
                    aria-label={editingId ? 'Save changes' : 'Create template'}
                  >
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Template'}
                  </button>
                  <button
                    type="button"
                    style={styles.btnCancel}
                    onClick={closeForm}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Delete Confirmation */}
            {deletingId && (
              <div style={styles.deleteConfirm} role="alertdialog" aria-label="Confirm deletion">
                <span style={styles.deleteConfirmText}>
                  Are you sure you want to delete this template?
                </span>
                <button
                  type="button"
                  style={styles.btnDelete}
                  onClick={() => handleDelete(deletingId)}
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  style={styles.btnCancel}
                  onClick={() => setDeletingId(null)}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Template List */}
            {templates.length === 0 ? (
              <div style={styles.emptyState}>
                No SMS templates configured. Add a template to automate follow-up messages.
              </div>
            ) : (
              <ul style={styles.templateList} aria-label="SMS templates">
                {templates.map((template) => (
                  <li key={template.id} style={styles.templateItem}>
                    <div style={styles.templateInfo}>
                      <div style={styles.templateName}>
                        {template.name}
                        <span
                          style={{
                            ...styles.badge,
                            ...(template.isActive ? styles.badgeActive : styles.badgeInactive),
                          }}
                        >
                          {template.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div style={styles.templateBody}>{template.body}</div>
                      <div style={styles.templateMeta}>
                        Trigger:{' '}
                        {TRIGGER_EVENTS.find((e) => e.value === template.triggerEvent)?.label ??
                          template.triggerEvent}
                      </div>
                    </div>
                    <div style={styles.buttonGroup}>
                      <button
                        type="button"
                        style={styles.btnEdit}
                        onClick={() => openEditForm(template)}
                        aria-label={`Edit template: ${template.name}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        style={styles.btnDelete}
                        onClick={() => setDeletingId(template.id)}
                        aria-label={`Delete template: ${template.name}`}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {!showForm && (
              <button type="button" style={styles.btnAdd} onClick={openAddForm}>
                + Add Template
              </button>
            )}
          </>
        )}
      </section>

      {/* Reminder Intervals Section */}
      <section style={styles.section} aria-labelledby="reminders-heading">
        <h2 id="reminders-heading" style={styles.sectionTitle}>
          Appointment Reminder Intervals
        </h2>
        <div style={styles.reminderSection}>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
            Select when automated reminder messages should be sent before appointments.
          </p>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}>
              Reminder intervals
            </legend>
            <div style={styles.checkboxGroup}>
              {REMINDER_INTERVALS.map((interval) => (
                <label key={interval.value} style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    style={styles.checkbox}
                    checked={reminderIntervals.includes(interval.value)}
                    onChange={() => handleReminderToggle(interval.value)}
                    disabled={savingReminders}
                    aria-label={`Send reminder ${interval.label} before appointment`}
                  />
                  {interval.label} before appointment
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>
    </div>
  );
}
