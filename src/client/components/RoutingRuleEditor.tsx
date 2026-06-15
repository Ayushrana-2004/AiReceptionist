import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiClientError } from '../services/api';
import type { RoutingRule, TransferDestination, TransferDestinationType } from '../../shared/types';

interface RoutingRuleFormData {
  intentCategory: string;
  priority: number;
  destinations: TransferDestination[];
  isActive: boolean;
}

interface DestinationFormData {
  type: TransferDestinationType;
  target: string;
  label: string;
  timeoutSeconds: number;
}

const INTENT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'support', label: 'Support' },
  { value: 'billing', label: 'Billing' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'custom', label: 'Custom' },
];

const DESTINATION_TYPES: { value: TransferDestinationType; label: string }[] = [
  { value: 'phone', label: 'Phone' },
  { value: 'sip', label: 'SIP' },
  { value: 'queue', label: 'Queue' },
];

const MAX_RULES = 50;
const MAX_DESTINATIONS = 3;

const EMPTY_DESTINATION: DestinationFormData = {
  type: 'phone',
  target: '',
  label: '',
  timeoutSeconds: 15,
};

const EMPTY_FORM: RoutingRuleFormData = {
  intentCategory: 'sales',
  priority: 1,
  destinations: [],
  isActive: true,
};

interface ValidationErrors {
  intentCategory?: string;
  priority?: string;
  destinations?: string;
  destinationErrors?: { target?: string; label?: string }[];
}

function validateForm(data: RoutingRuleFormData): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!data.intentCategory.trim()) {
    errors.intentCategory = 'Intent category is required';
  }

  if (data.priority < 1) {
    errors.priority = 'Priority must be at least 1';
  }

  if (data.destinations.length === 0) {
    errors.destinations = 'At least one destination is required';
  } else if (data.destinations.length > MAX_DESTINATIONS) {
    errors.destinations = `Maximum ${MAX_DESTINATIONS} destinations allowed`;
  }

  const destinationErrors: { target?: string; label?: string }[] = [];
  let hasDestError = false;
  for (const dest of data.destinations) {
    const destErr: { target?: string; label?: string } = {};
    if (!dest.target.trim()) {
      destErr.target = 'Target is required';
      hasDestError = true;
    }
    if (!dest.label.trim()) {
      destErr.label = 'Label is required';
      hasDestError = true;
    }
    destinationErrors.push(destErr);
  }
  if (hasDestError) {
    errors.destinationErrors = destinationErrors;
  }

  return errors;
}

export default function RoutingRuleEditor() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<RoutingRuleFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<ValidationErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toggle active state
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<any>('/routing-rules');
      const data = response.data;
      setRules(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : Array.isArray(data?.rules) ? data.rules : []);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to load routing rules');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Form handlers
  const handleOpenAdd = () => {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setEditingId(null);
    setShowForm(true);
  };

  const handleOpenEdit = (rule: RoutingRule) => {
    setFormData({
      intentCategory: rule.intentCategory,
      priority: rule.priority,
      destinations: [...rule.destinations],
      isActive: rule.isActive,
    });
    setFormErrors({});
    setEditingId(rule.id);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
  };

  const handleFieldChange = (field: keyof RoutingRuleFormData, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field as keyof ValidationErrors]) {
      const newErrors = { ...formErrors };
      delete newErrors[field as keyof ValidationErrors];
      setFormErrors(newErrors);
    }
  };

  // Destination handlers
  const handleAddDestination = () => {
    if (formData.destinations.length >= MAX_DESTINATIONS) return;
    setFormData((prev) => ({
      ...prev,
      destinations: [...prev.destinations, { ...EMPTY_DESTINATION }],
    }));
    // Clear destinations error
    if (formErrors.destinations) {
      const newErrors = { ...formErrors };
      delete newErrors.destinations;
      setFormErrors(newErrors);
    }
  };

  const handleRemoveDestination = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      destinations: prev.destinations.filter((_, i) => i !== index),
    }));
  };

  const handleDestinationChange = (index: number, field: keyof DestinationFormData, value: string | number) => {
    setFormData((prev) => {
      const newDests = [...prev.destinations];
      newDests[index] = { ...newDests[index], [field]: value };
      return { ...prev, destinations: newDests };
    });
    // Clear specific destination error
    if (formErrors.destinationErrors?.[index]) {
      const newErrors = { ...formErrors };
      if (newErrors.destinationErrors) {
        newErrors.destinationErrors = [...newErrors.destinationErrors];
        newErrors.destinationErrors[index] = { ...newErrors.destinationErrors[index] };
        delete newErrors.destinationErrors[index][field as keyof { target?: string; label?: string }];
      }
      setFormErrors(newErrors);
    }
  };

  const handleMoveDestination = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= formData.destinations.length) return;
    setFormData((prev) => {
      const newDests = [...prev.destinations];
      const temp = newDests[index];
      newDests[index] = newDests[newIndex];
      newDests[newIndex] = temp;
      return { ...prev, destinations: newDests };
    });
  };

  const handleSave = async () => {
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    // Check capacity before adding
    if (!editingId && rules.length >= MAX_RULES) {
      setError(`Cannot add rule: maximum routing rules (${MAX_RULES}) reached`);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        intentCategory: formData.intentCategory,
        priority: formData.priority,
        destinations: formData.destinations,
        isActive: formData.isActive,
      };

      if (editingId) {
        await apiClient.put(`/routing-rules/${editingId}`, payload);
      } else {
        await apiClient.post('/routing-rules', payload);
      }

      await fetchRules();
      handleCancel();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 409) {
          setError('Capacity exceeded: the maximum number of routing rules has been reached.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to save routing rule');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      setError(null);
      await apiClient.delete(`/routing-rules/${id}`);
      setDeleteConfirmId(null);
      await fetchRules();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to delete routing rule');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (rule: RoutingRule) => {
    try {
      setToggling(rule.id);
      setError(null);
      await apiClient.put(`/routing-rules/${rule.id}`, {
        ...rule,
        isActive: !rule.isActive,
      });
      await fetchRules();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to toggle rule status');
      }
    } finally {
      setToggling(null);
    }
  };

  const getCategoryLabel = (category: string): string => {
    return INTENT_CATEGORIES.find((c) => c.value === category)?.label || category;
  };

  const getDestinationTypeLabel = (type: TransferDestinationType): string => {
    return DESTINATION_TYPES.find((t) => t.value === type)?.label || type;
  };

  return (
    <section aria-labelledby="routing-editor-heading">
      <h2 id="routing-editor-heading">Routing Rules</h2>

      {/* Capacity display */}
      <div role="status" aria-live="polite" style={{ marginBottom: '1rem' }}>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>{rules.length}/{MAX_RULES}</strong> rules configured
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div role="alert" style={{ color: '#d32f2f', marginBottom: '1rem', padding: '0.75rem', border: '1px solid #d32f2f', borderRadius: '4px', backgroundColor: '#fef2f2' }}>
          {error}
        </div>
      )}

      {/* Add button */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleOpenAdd}
          disabled={showForm || rules.length >= MAX_RULES}
          style={{ padding: '0.5rem 1rem' }}
          aria-label="Add routing rule"
        >
          Add Rule
        </button>
        {rules.length >= MAX_RULES && (
          <span style={{ fontSize: '0.85rem', color: '#b45309' }}>
            Maximum capacity reached
          </span>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div
          style={{
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: '#f9f9f9',
          }}
          role="form"
          aria-label={editingId ? 'Edit routing rule' : 'Add routing rule'}
        >
          <h3>{editingId ? 'Edit Rule' : 'Add New Rule'}</h3>

          {/* Intent Category */}
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="routing-form-category">Intent Category *</label>
            <select
              id="routing-form-category"
              value={formData.intentCategory}
              onChange={(e) => handleFieldChange('intentCategory', e.target.value)}
              style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
              aria-invalid={!!formErrors.intentCategory}
              aria-describedby={formErrors.intentCategory ? 'routing-form-category-error' : undefined}
            >
              {INTENT_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            {formErrors.intentCategory && (
              <p id="routing-form-category-error" style={{ color: '#d32f2f', margin: '0.25rem 0 0' }} role="alert">
                {formErrors.intentCategory}
              </p>
            )}
          </div>

          {/* Priority */}
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="routing-form-priority">Priority *</label>
            <input
              id="routing-form-priority"
              type="number"
              min={1}
              value={formData.priority}
              onChange={(e) => handleFieldChange('priority', parseInt(e.target.value, 10) || 1)}
              style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
              aria-invalid={!!formErrors.priority}
              aria-describedby={formErrors.priority ? 'routing-form-priority-error' : 'routing-form-priority-hint'}
            />
            <p id="routing-form-priority-hint" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#666' }}>
              Lower numbers indicate higher priority
            </p>
            {formErrors.priority && (
              <p id="routing-form-priority-error" style={{ color: '#d32f2f', margin: '0.25rem 0 0' }} role="alert">
                {formErrors.priority}
              </p>
            )}
          </div>

          {/* Active toggle */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => handleFieldChange('isActive', e.target.checked)}
                aria-label="Rule is active"
              />
              Active
            </label>
          </div>

          {/* Destinations */}
          <fieldset style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '1rem', marginBottom: '1rem' }}>
            <legend>
              Destinations ({formData.destinations.length}/{MAX_DESTINATIONS}) *
            </legend>
            {formErrors.destinations && (
              <p style={{ color: '#d32f2f', margin: '0 0 0.5rem' }} role="alert">
                {formErrors.destinations}
              </p>
            )}

            {formData.destinations.map((dest, index) => (
              <div
                key={index}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                  padding: '0.75rem',
                  marginBottom: '0.75rem',
                  backgroundColor: '#fff',
                }}
                aria-label={`Destination ${index + 1}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.9rem' }}>Destination {index + 1}</strong>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => handleMoveDestination(index, 'up')}
                      disabled={index === 0}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      aria-label={`Move destination ${index + 1} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDestination(index, 'down')}
                      disabled={index === formData.destinations.length - 1}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      aria-label={`Move destination ${index + 1} down`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveDestination(index)}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: '#d32f2f' }}
                      aria-label={`Remove destination ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Destination Type */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <label htmlFor={`dest-type-${index}`}>Type</label>
                  <select
                    id={`dest-type-${index}`}
                    value={dest.type}
                    onChange={(e) => handleDestinationChange(index, 'type', e.target.value)}
                    style={{ display: 'block', width: '100%', padding: '0.4rem', marginTop: '0.2rem' }}
                  >
                    {DESTINATION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Target */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <label htmlFor={`dest-target-${index}`}>
                    Target {dest.type === 'phone' ? '(phone number)' : dest.type === 'sip' ? '(SIP URI)' : '(queue name)'} *
                  </label>
                  <input
                    id={`dest-target-${index}`}
                    type="text"
                    value={dest.target}
                    onChange={(e) => handleDestinationChange(index, 'target', e.target.value)}
                    placeholder={dest.type === 'phone' ? '+1234567890' : dest.type === 'sip' ? 'sip:user@domain.com' : 'queue-name'}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '0.4rem',
                      marginTop: '0.2rem',
                      borderColor: formErrors.destinationErrors?.[index]?.target ? '#d32f2f' : undefined,
                    }}
                    aria-invalid={!!formErrors.destinationErrors?.[index]?.target}
                    aria-describedby={formErrors.destinationErrors?.[index]?.target ? `dest-target-error-${index}` : undefined}
                  />
                  {formErrors.destinationErrors?.[index]?.target && (
                    <p id={`dest-target-error-${index}`} style={{ color: '#d32f2f', margin: '0.2rem 0 0', fontSize: '0.85rem' }} role="alert">
                      {formErrors.destinationErrors[index].target}
                    </p>
                  )}
                </div>

                {/* Label */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <label htmlFor={`dest-label-${index}`}>Label *</label>
                  <input
                    id={`dest-label-${index}`}
                    type="text"
                    value={dest.label}
                    onChange={(e) => handleDestinationChange(index, 'label', e.target.value)}
                    placeholder="e.g., Sales Team"
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '0.4rem',
                      marginTop: '0.2rem',
                      borderColor: formErrors.destinationErrors?.[index]?.label ? '#d32f2f' : undefined,
                    }}
                    aria-invalid={!!formErrors.destinationErrors?.[index]?.label}
                    aria-describedby={formErrors.destinationErrors?.[index]?.label ? `dest-label-error-${index}` : undefined}
                  />
                  {formErrors.destinationErrors?.[index]?.label && (
                    <p id={`dest-label-error-${index}`} style={{ color: '#d32f2f', margin: '0.2rem 0 0', fontSize: '0.85rem' }} role="alert">
                      {formErrors.destinationErrors[index].label}
                    </p>
                  )}
                </div>

                {/* Timeout */}
                <div>
                  <label htmlFor={`dest-timeout-${index}`}>Timeout (seconds)</label>
                  <input
                    id={`dest-timeout-${index}`}
                    type="number"
                    min={5}
                    max={120}
                    value={dest.timeoutSeconds}
                    onChange={(e) => handleDestinationChange(index, 'timeoutSeconds', parseInt(e.target.value, 10) || 15)}
                    style={{ display: 'block', width: '100%', padding: '0.4rem', marginTop: '0.2rem' }}
                  />
                </div>
              </div>
            ))}

            {formData.destinations.length < MAX_DESTINATIONS && (
              <button
                type="button"
                onClick={handleAddDestination}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
                aria-label="Add destination"
              >
                + Add Destination
              </button>
            )}
          </fieldset>

          {/* Form actions */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '0.5rem 1rem' }}
            >
              {saving ? 'Saving...' : editingId ? 'Update Rule' : 'Save Rule'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              style={{ padding: '0.5rem 1rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <p role="status">Loading routing rules...</p>
      ) : rules.length === 0 ? (
        <p>No routing rules configured. Add a rule to get started.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Routing rules">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Intent</th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Priority</th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Destinations</th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} style={{ opacity: rule.isActive ? 1 : 0.6 }}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  {getCategoryLabel(rule.intentCategory)}
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  {rule.priority}
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {rule.destinations.map((dest, i) => (
                      <li key={i} style={{ fontSize: '0.85rem', marginBottom: '0.2rem' }}>
                        {i + 1}. {dest.label} ({getDestinationTypeLabel(dest.type)}: {dest.target}, {dest.timeoutSeconds}s)
                      </li>
                    ))}
                  </ul>
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(rule)}
                    disabled={toggling === rule.id}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.85rem',
                      backgroundColor: rule.isActive ? '#dcfce7' : '#fef2f2',
                      border: `1px solid ${rule.isActive ? '#16a34a' : '#d32f2f'}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: rule.isActive ? '#166534' : '#991b1b',
                    }}
                    aria-label={`${rule.isActive ? 'Deactivate' : 'Activate'} rule for ${getCategoryLabel(rule.intentCategory)}`}
                  >
                    {toggling === rule.id ? '...' : rule.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  {deleteConfirmId === rule.id ? (
                    <span>
                      <span style={{ marginRight: '0.5rem', fontSize: '0.85rem' }}>Delete?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(rule.id)}
                        disabled={deleting}
                        style={{ marginRight: '0.25rem', color: '#d32f2f' }}
                        aria-label={`Confirm delete rule for ${getCategoryLabel(rule.intentCategory)}`}
                      >
                        {deleting ? 'Deleting...' : 'Yes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        disabled={deleting}
                        aria-label="Cancel delete"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <span>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(rule)}
                        style={{ marginRight: '0.5rem' }}
                        aria-label={`Edit rule for ${getCategoryLabel(rule.intentCategory)}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(rule.id)}
                        aria-label={`Delete rule for ${getCategoryLabel(rule.intentCategory)}`}
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
