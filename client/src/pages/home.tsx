import FeedbackForm from "@/components/feedback-form";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-5">
        <div 
          className="absolute inset-0" 
          style={{
            backgroundImage: 'radial-gradient(circle at 25% 25%, hsl(260, 86%, 58%) 2px, transparent 2px)',
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      {/* Main Container */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md animate-fade-in">
          <FeedbackForm />
        </div>
      </div>
    </div>
  );
}
