import SMSTemplateEditor from '../SMSTemplateEditor';

export default function SMSPage() {
  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#1a1a2e' }}>
        SMS Templates
      </h1>
      <SMSTemplateEditor />
    </div>
  );
}
