export default function StatHighlight({ value, label, sublabel, color = 'text-[#c41e3a]' }) {
  return (
    <div className="text-center px-4">
      <div className={`text-4xl sm:text-5xl font-extrabold tracking-tight ${color}`}>
        {value}
      </div>
      <div className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
        {label}
      </div>
      {sublabel && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sublabel}</div>
      )}
    </div>
  )
}
