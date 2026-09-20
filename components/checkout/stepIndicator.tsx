interface StepIndicatorProps {
  currentStep: number;
  steps: string[];
}

export default function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center space-x-4 mb-8">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
              index + 1 === currentStep
                ? 'bg-gradient-to-r from-amber-600 to-amber-800 text-white'
                : index + 1 < currentStep
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {index + 1 < currentStep ? '✓' : index + 1}
          </div>
          <span
            className={`ml-2 text-sm font-medium ${
              index + 1 === currentStep
                ? 'text-amber-700'
                : index + 1 < currentStep
                ? 'text-emerald-600'
                : 'text-gray-400'
            }`}
          >
            {step}
          </span>
          {index < steps.length - 1 && (
            <div
              className={`w-12 h-0.5 mx-2 ${
                index + 1 < currentStep ? 'bg-emerald-500' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}