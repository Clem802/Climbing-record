const ATTEMPT_OPTIONS = [
  { value: 1, label: '1', activeColor: 'bg-green-600 text-white' },
  { value: 2, label: '2', activeColor: 'bg-yellow-500 text-white' },
  { value: 3, label: '3', activeColor: 'bg-orange-500 text-white' },
  { value: 4, label: '4+', activeColor: 'bg-red-600 text-white' },
];

export default function BoulderCard({ number, value, onChange, disabled }) {
  return (
    <div className="bg-gray-800 rounded-lg p-2 flex flex-col items-center gap-1.5">
      <span className="text-xs font-bold text-gray-400">{number}</span>
      <div className={`flex gap-0.5 flex-wrap justify-center ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}>
        {ATTEMPT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onChange(value === opt.value ? null : opt.value)}
            className={`text-xs font-semibold px-2 py-2 rounded transition min-w-[44px]
              ${value === opt.value
                ? opt.activeColor
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => !disabled && onChange(null)}
          className={`text-xs font-semibold px-2 py-2 rounded transition min-w-[44px]
            ${value === null
              ? 'bg-gray-600 text-gray-200'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-400'}`}
        >
          —
        </button>
      </div>
    </div>
  );
}
