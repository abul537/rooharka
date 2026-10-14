'use client';
import { useState } from 'react';
import { AddressFormData } from '@/lib/types';
import AddressStep from './steps/addressStep';
import PaymentStep from './steps/paymentStep';
import StepIndicator from '@/components/checkout/stepIndicator';

export default function CheckoutPage() {
  const [step, setStep] = useState<1 | 2>(1);         // track the current step (1 for Address, 2 for Payment)
  const [addressData, setAddressData] = useState<AddressFormData | null>(null); // store the address data collected from the AddressStep when the user fills out the form and clicks "Next"

  // This function is called when the user completes the address form and clicks "Next". It receives the address data from the AddressStep component, stores it in state, and advances to the Payment step.

  const handleAddressNext = (data: AddressFormData) => {
    setAddressData(data); // Store the address data in state
    setStep(2); // Move to the Payment step
  };

  // This function is called when the user clicks "Back" on the Payment step. It simply moves the user back to the Address step.
  const handlePaymentBack = () => {
    setStep(1);
  };
  // This function is called when the user completes the payment step. It receives the selected payment method and can be used to finalize the order. In this demo, it simply logs the order details and shows an alert.

  const handlePaymentComplete = (method: string) => {
    // Here you would create the order with all data
    console.log('Order completed:', { address: addressData, paymentMethod: method });
    // Redirect to success page or show confirmation
    alert('Order placed successfully! (Demo)');
  };

  // Define the steps for the step indicator
  const steps = ['Address', 'Payment'];

  // Render the checkout page with a step indicator and the appropriate step content based on the current step
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white pt-32 pb-20">
      <div className="container mx-auto px-4 max-w-3xl">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-amber-100 to-emerald-100 mb-4">
            <span className="text-3xl">🛍️</span>
          </div>
          <h1 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-2">
            Checkout
          </h1>
          <p className="text-gray-600">
            Complete your order for Darwaish® Sacred Oil
          </p>
        </div>

        {/* Step Indicator */}
        {/* Shows the customer which step they are on (passes the current step and the list of steps). */}
        <StepIndicator currentStep={step} steps={steps} />

        {/* Step Content */}
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          {step === 1 && (
            <AddressStep onNext={handleAddressNext} initialData={addressData || undefined} />
          )}
          {step === 2 && (
            <PaymentStep onBack={handlePaymentBack} onComplete={handlePaymentComplete} />
          )}
        </div>
      </div>
    </div>
  );
}