/** Placeholder until Phase C (student group leaderboards). */
export default function StudentGroupsScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="waiting">
      <div className="waiting__box">
        <p>المجموعات الخاصة قيد الإعداد.</p>
        <button type="button" className="pixel-button" onClick={onBack}>
          رجوع
        </button>
      </div>
    </div>
  )
}
