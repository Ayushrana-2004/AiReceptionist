import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiClientError } from '../services/api';
import type { KBEntry, KBCategory, Language } from '../../shared/types';

interface KBEntryFormData {
  category: KBCategory;
  question: string;
  answer: string;
  language: Language;
}

const CATEGORIES: { value: KBCategory; label: string }[] = [
  { value: 'business_hours', label: 'Business Hours' },
  { value: 'services', label: 'Services' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'location', label: 'Location' },
  { value: 'custom', label: 'Custom' },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'zh', label: 'Mandarin' },
];

const MAX_QUESTION_LENGTH = 200;
const MAX_ANSWER_LENGTH = 2000;
const MAX_TOTAL_ENTRIES = 500;
const MAX_ENTRIES_PER_CATEGORY = 100;

const EMPTY_FORM: KBEntryFormData = {
  category: 'custom',
  question: '',
  answer: '',
  language: 'en',
};

interface ValidationErrors {
  question?: string;
  answer?: string;
  category?: string;
}

function validateForm(data: KBEntryFormData): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!data.question.trim()) {
    errors.question = 'Question/topic is required';
  } else if (data.question.length > MAX_QUESTION_LENGTH) {
    errors.question = `Question must not exceed ${MAX_QUESTION_LENGTH} characters (${data.question.length}/${MAX_QUESTION_LENGTH})`;
  }

  if (!data.answer.trim()) {
    errors.answer = 'Answer/content is required';
  } else if (data.answer.length > MAX_ANSWER_LENGTH) {
    errors.answer = `Answer must not exceed ${MAX_ANSWER_LENGTH} characters (${data.answer.length}/${MAX_ANSWER_LENGTH})`;
  }

  if (!data.category) {
    errors.category = 'Category is required';
  }

  return errors;
}

export default function KnowledgeBaseEditor() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<KBCategory | 'all'>('all');

  // Form state
  const [formData, setFormData] = useState<KBEntryFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<ValidationErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<{ entries: KBEntry[] }>('/knowledge-base');
      const data = response.data;
      setEntries(Array.isArray(data.entries) ? data.entries : Array.isArray(data) ? data : []);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to load knowledge base entries');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Capacity calculations
  const totalEntries = entries.length;
  const entriesByCategory = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.category] = (acc[entry.category] || 0) + 1;
    return acc;
  }, {});

  // Group entries by category for display
  const groupedEntries = (() => {
    const filtered = filterCategory === 'all'
      ? entries
      : entries.filter((e) => e.category === filterCategory);

    const groups: Record<string, KBEntry[]> = {};
    for (const entry of filtered) {
      if (!groups[entry.category]) {
        groups[entry.category] = [];
      }
      groups[entry.category].push(entry);
    }
    return groups;
  })();

  // Form handlers
  const handleOpenAdd = () => {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setEditingId(null);
    setShowForm(true);
  };

  const handleOpenEdit = (entry: KBEntry) => {
    setFormData({
      category: entry.category,
      question: entry.question,
      answer: entry.answer,
      language: entry.language,
    });
    setFormErrors({});
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
  };

  const handleFieldChange = (field: keyof KBEntryFormData, value: string) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);

    // Clear field error on change
    if (formErrors[field as keyof ValidationErrors]) {
      const newErrors = { ...formErrors };
      delete newErrors[field as keyof ValidationErrors];
      setFormErrors(newErrors);
    }
  };

  const handleSave = async () => {
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    // Check capacity before adding (client-side check)
    if (!editingId) {
      if (totalEntries >= MAX_TOTAL_ENTRIES) {
        setError(`Cannot add entry: maximum total entries (${MAX_TOTAL_ENTRIES}) reached`);
        return;
      }
      const categoryCount = entriesByCategory[formData.category] || 0;
      if (categoryCount >= MAX_ENTRIES_PER_CATEGORY) {
        setError(`Cannot add entry: maximum entries per category (${MAX_ENTRIES_PER_CATEGORY}) reached for "${getCategoryLabel(formData.category)}"`);
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);

      if (editingId) {
        await apiClient.put(`/knowledge-base/${editingId}`, formData);
      } else {
        await apiClient.post('/knowledge-base', formData);
      }

      await fetchEntries();
      handleCancel();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 409) {
          setError('Capacity exceeded: the knowledge base has reached its maximum number of entries. Please delete some entries before adding new ones.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to save entry');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      setError(null);
      await apiClient.delete(`/knowledge-base/${id}`);
      setDeleteConfirmId(null);
      await fetchEntries();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to delete entry');
      }
    } finally {
      setDeleting(false);
    }
  };

  const getCategoryLabel = (category: KBCategory | string): string => {
    return CATEGORIES.find((c) => c.value === category)?.label || category;
  };

  const getLanguageLabel = (language: Language): string => {
    return LANGUAGES.find((l) => l.value === language)?.label || language;
  };

  return (
    <section aria-labelledby="kb-editor-heading">
      <h2 id="kb-editor-heading">Knowledge Base</h2>

      {/* Capacity display */}
      <div role="status" aria-live="polite" style={{ marginBottom: '1rem' }}>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>{totalEntries}/{MAX_TOTAL_ENTRIES}</strong> total entries
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {CATEGORIES.map((cat) => (
            <li key={cat.value} style={{ fontSize: '0.9rem', color: '#555' }}>
              {cat.label}: <strong>{entriesByCategory[cat.value] || 0}/{MAX_ENTRIES_PER_CATEGORY}</strong>
            </li>
          ))}
        </ul>
      </div>

      {/* Error display */}
      {error && (
        <div role="alert" style={{ color: '#d32f2f', marginBottom: '1rem', padding: '0.75rem', border: '1px solid #d32f2f', borderRadius: '4px', backgroundColor: '#fef2f2' }}>
          {error}
        </div>
      )}

      {/* Category filter and Add button */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="kb-category-filter">
          Filter by category:
        </label>
        <select
          id="kb-category-filter"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as KBCategory | 'all')}
          style={{ padding: '0.5rem' }}
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label} ({entriesByCategory[cat.value] || 0}/{MAX_ENTRIES_PER_CATEGORY})
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleOpenAdd}
          disabled={showForm}
          style={{ padding: '0.5rem 1rem' }}
        >
          Add Entry
        </button>
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
          aria-label={editingId ? 'Edit knowledge base entry' : 'Add knowledge base entry'}
        >
          <h3>{editingId ? 'Edit Entry' : 'Add New Entry'}</h3>

          {/* Category */}
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="kb-form-category">Category *</label>
            <select
              id="kb-form-category"
              value={formData.category}
              onChange={(e) => handleFieldChange('category', e.target.value)}
              style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
              aria-invalid={!!formErrors.category}
              aria-describedby={formErrors.category ? 'kb-form-category-error' : undefined}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            {formErrors.category && (
              <p id="kb-form-category-error" style={{ color: '#d32f2f', margin: '0.25rem 0 0' }} role="alert">
                {formErrors.category}
              </p>
            )}
          </div>

          {/* Question */}
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="kb-form-question">
              Question / Topic *
            </label>
            <input
              id="kb-form-question"
              type="text"
              value={formData.question}
              onChange={(e) => handleFieldChange('question', e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.5rem',
                marginTop: '0.25rem',
                borderColor: formErrors.question ? '#d32f2f' : undefined,
              }}
              aria-invalid={!!formErrors.question}
              aria-describedby={formErrors.question ? 'kb-form-question-error kb-form-question-hint' : 'kb-form-question-hint'}
            />
            <p
              id="kb-form-question-hint"
              style={{
                margin: '0.25rem 0 0',
                fontSize: '0.85rem',
                color: formData.question.length > MAX_QUESTION_LENGTH ? '#d32f2f' : formData.question.length > MAX_QUESTION_LENGTH * 0.9 ? '#b45309' : '#666',
              }}
              aria-live="polite"
            >
              {formData.question.length}/{MAX_QUESTION_LENGTH} characters
            </p>
            {formErrors.question && (
              <p id="kb-form-question-error" style={{ color: '#d32f2f', margin: '0.25rem 0 0' }} role="alert">
                {formErrors.question}
              </p>
            )}
          </div>

          {/* Answer */}
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="kb-form-answer">
              Answer / Content *
            </label>
            <textarea
              id="kb-form-answer"
              value={formData.answer}
              onChange={(e) => handleFieldChange('answer', e.target.value)}
              rows={5}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.5rem',
                marginTop: '0.25rem',
                resize: 'vertical',
                borderColor: formErrors.answer ? '#d32f2f' : undefined,
              }}
              aria-invalid={!!formErrors.answer}
              aria-describedby={formErrors.answer ? 'kb-form-answer-error kb-form-answer-hint' : 'kb-form-answer-hint'}
            />
            <p
              id="kb-form-answer-hint"
              style={{
                margin: '0.25rem 0 0',
                fontSize: '0.85rem',
                color: formData.answer.length > MAX_ANSWER_LENGTH ? '#d32f2f' : formData.answer.length > MAX_ANSWER_LENGTH * 0.9 ? '#b45309' : '#666',
              }}
              aria-live="polite"
            >
              {formData.answer.length}/{MAX_ANSWER_LENGTH} characters
            </p>
            {formErrors.answer && (
              <p id="kb-form-answer-error" style={{ color: '#d32f2f', margin: '0.25rem 0 0' }} role="alert">
                {formErrors.answer}
              </p>
            )}
          </div>

          {/* Language */}
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="kb-form-language">Language</label>
            <select
              id="kb-form-language"
              value={formData.language}
              onChange={(e) => handleFieldChange('language', e.target.value)}
              style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>{lang.label}</option>
              ))}
            </select>
          </div>

          {/* Form actions */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '0.5rem 1rem' }}
            >
              {saving ? 'Saving...' : editingId ? 'Update Entry' : 'Save Entry'}
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

      {/* Entries list grouped by category */}
      {loading ? (
        <p role="status">Loading entries...</p>
      ) : Object.keys(groupedEntries).length === 0 ? (
        <p>No entries found{filterCategory !== 'all' ? ` in category "${getCategoryLabel(filterCategory)}"` : ''}.</p>
      ) : (
        <div>
          {CATEGORIES
            .filter((cat) => groupedEntries[cat.value] && groupedEntries[cat.value].length > 0)
            .map((cat) => (
              <div key={cat.value} style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#374151', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.25rem' }}>
                  {cat.label}
                  <span style={{ fontWeight: 'normal', fontSize: '0.85rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                    ({groupedEntries[cat.value].length}/{MAX_ENTRIES_PER_CATEGORY})
                  </span>
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label={`Knowledge base entries - ${cat.label}`}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Question / Topic</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Language</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ddd' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedEntries[cat.value].map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                          {entry.question}
                        </td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                          {getLanguageLabel(entry.language)}
                        </td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                          {deleteConfirmId === entry.id ? (
                            <span>
                              <span style={{ marginRight: '0.5rem' }}>Delete this entry?</span>
                              <button
                                type="button"
                                onClick={() => handleDelete(entry.id)}
                                disabled={deleting}
                                style={{ marginRight: '0.25rem', color: '#d32f2f' }}
                                aria-label={`Confirm delete "${entry.question}"`}
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
                                onClick={() => handleOpenEdit(entry)}
                                style={{ marginRight: '0.5rem' }}
                                aria-label={`Edit "${entry.question}"`}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(entry.id)}
                                aria-label={`Delete "${entry.question}"`}
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
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
