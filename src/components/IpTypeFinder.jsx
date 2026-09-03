import { useState, useId } from 'react';
import {
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  Check,
  AlertCircle,
  Edit3,
  Layers,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';

export const QUESTIONS = [
  {
    id: 1,
    key: 'q1',
    title: 'What is the main innovation in your product?',
    options: [
      { id: 'work', label: 'A. The way the product works', tech: 3, design: 0 },
      { id: 'look', label: 'B. The way the product looks', tech: 0, design: 3 },
      { id: 'both', label: 'C. Both functionality and appearance', tech: 2, design: 2 },
      { id: 'not_sure', label: "D. I'm not sure", tech: 0, design: 0 }
    ]
  },
  {
    id: 2,
    key: 'q2',
    title: 'Does your product introduce a new or improved technical function?',
    options: [
      { id: 'yes', label: 'Yes', tech: 2, design: 0 },
      { id: 'no', label: 'No', tech: 0, design: 0 },
      { id: 'not_sure', label: 'Not Sure', tech: 0, design: 0 }
    ]
  },
  {
    id: 3,
    key: 'q3',
    title: 'Does your product contain a new mechanism, process, system, or method?',
    options: [
      { id: 'yes', label: 'Yes', tech: 3, design: 0 },
      { id: 'no', label: 'No', tech: 0, design: 0 },
      { id: 'not_sure', label: 'Not Sure', tech: 0, design: 0 }
    ]
  },
  {
    id: 4,
    key: 'q4',
    title: "Is the product's shape, configuration, pattern, or appearance a major part of your innovation?",
    options: [
      { id: 'yes', label: 'Yes', tech: 0, design: 3 },
      { id: 'no', label: 'No', tech: 0, design: 0 },
      { id: 'not_sure', label: 'Not Sure', tech: 0, design: 0 }
    ]
  },
  {
    id: 5,
    key: 'q5',
    title: "If the product's appearance were changed completely, would your main innovation still remain?",
    options: [
      { id: 'yes', label: 'Yes', tech: 2, design: 0 },
      { id: 'no', label: 'No', tech: 0, design: 2 },
      { id: 'not_sure', label: 'Not Sure', tech: 0, design: 0 }
    ]
  },
  {
    id: 6,
    key: 'q6',
    title: 'If the internal mechanism or technical function were removed, would the main value of your innovation remain?',
    options: [
      { id: 'yes', label: 'Yes', tech: 0, design: 2 },
      { id: 'no', label: 'No', tech: 2, design: 0 },
      { id: 'not_sure', label: 'Not Sure', tech: 0, design: 0 }
    ]
  },
  {
    id: 7,
    key: 'q7',
    title: 'What are you mainly trying to protect?',
    options: [
      { id: 'function', label: 'A. Function / Technical Working', tech: 4, design: 0 },
      { id: 'shape', label: 'B. Shape / Appearance / Visual Design', tech: 0, design: 4 },
      { id: 'both', label: 'C. Both', tech: 3, design: 3 },
      { id: 'not_sure', label: 'D. Not Sure', tech: 0, design: 0 }
    ]
  }
];

export function calculateIpRecommendation(answers) {
  let technicalScore = 0;
  let designScore = 0;

  QUESTIONS.forEach((q) => {
    const selectedOptId = answers[q.key];
    if (!selectedOptId) return;
    const opt = q.options.find(o => o.id === selectedOptId);
    if (opt) {
      technicalScore += opt.tech || 0;
      designScore += opt.design || 0;
    }
  });

  const totalPossibleTech = 16;
  const totalPossibleDesign = 14;

  const techPercent = Math.min(Math.round((technicalScore / totalPossibleTech) * 100), 100);
  const designPercent = Math.min(Math.round((designScore / totalPossibleDesign) * 100), 100);

  let resultType = 'UNCLEAR';

  if (technicalScore >= 6 && designScore >= 6 && Math.abs(technicalScore - designScore) <= 4) {
    resultType = 'BOTH';
  } else if (technicalScore >= designScore + 3 && technicalScore >= 5) {
    resultType = 'TECHNICAL';
  } else if (designScore >= technicalScore + 3 && designScore >= 5) {
    resultType = 'DESIGN';
  } else if ((technicalScore >= 4 || designScore >= 4) && Math.abs(technicalScore - designScore) <= 2) {
    resultType = 'BOTH';
  } else {
    resultType = 'UNCLEAR';
  }

  return {
    technicalScore,
    designScore,
    techPercent,
    designPercent,
    resultType
  };
}

export default function IpTypeFinder({
  selectedPatentType = '',
  selectedCategory = '',
  onSelectPatentType,
  onSelectCategory
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // 0..6 for questions, 7 for results
  const [answers, setAnswers] = useState({});
  const [showReview, setShowReview] = useState(false);
  const isSoftware = selectedCategory === 'Software';

  const totalQuestions = QUESTIONS.length;
  const isResultScreen = currentStep >= totalQuestions;
  const currentQuestion = !isResultScreen ? QUESTIONS[currentStep] : null;
  const currentAnswer = currentQuestion ? answers[currentQuestion.key] : null;

  const answeredCount = Object.keys(answers).filter(k => answers[k] !== undefined).length;
  const allAnswered = answeredCount === totalQuestions;

  const recommendation = calculateIpRecommendation(answers);

  const handleSelectOption = (optId) => {
    if (!currentQuestion) return;
    const newAnswers = { ...answers, [currentQuestion.key]: optId };
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentStep < totalQuestions - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setCurrentStep(totalQuestions); // Show result screen
      setShowReview(false);
    }
  };

  const handleBack = () => {
    if (isResultScreen) {
      setCurrentStep(totalQuestions - 1);
    } else if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleReset = () => {
    setAnswers({});
    setCurrentStep(0);
    setShowReview(false);
  };

  const handleJumpToQuestion = (stepIndex) => {
    setCurrentStep(stepIndex);
    setShowReview(false);
  };

  const handleApplyPatentType = (type) => {
    if (onSelectPatentType) {
      onSelectPatentType(type);
    }
    // Scroll smoothly to the submission area
    const subArea = document.getElementById('official-templates-section');
    if (subArea) {
      subArea.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200 min-w-0">
      {/* Interactive Accordion Header Banner */}
      <div
        onClick={() => setIsExpanded(prev => !prev)}
        className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition select-none ${
          isExpanded ? "bg-slate-50/80 border-b border-slate-100" : "bg-white hover:bg-slate-50/50"
        }`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(prev => !prev);
          }
        }}
        aria-expanded={isExpanded}
        aria-label="Toggle IP Type Finder Questionnaire"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">
            <Sparkles size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {answeredCount > 0 && !isResultScreen && (
                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {answeredCount}/{totalQuestions} Answered
                </span>
              )}
              {isResultScreen && (
                <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Recommendation Ready
                </span>
              )}
            </div>
            <h3 className="text-base sm:text-lg font-black text-[#0B1B3A] font-bold leading-snug ">
              Which Intellectual Property Protection May Fit Your Innovation?
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1 leading-relaxed">
              Answer 7 simple questions about your product to determine whether Utility Patent, Design Patent, or Both may be relevant.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div
          className="shrink-0 flex items-center gap-2 self-stretch sm:self-center justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          {isExpanded && answeredCount > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer shadow-2xs"
              title="Restart questionnaire"
            >
              <RotateCcw size={13} />
              <span className="hidden xs:inline">Start Again</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-black transition cursor-pointer shadow-xs ${
              isExpanded
                ? "bg-slate-200/80 hover:bg-slate-300 text-slate-800"
                : "bg-accent hover:bg-amber-600 text-white"
            }`}
          >
            <span>
              {isExpanded
                ? "Collapse Questionnaire"
                : answeredCount > 0
                ? "Continue Questionnaire"
                : "Start IP Type Finder"}
            </span>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expandable Questionnaire Body */}
      {isExpanded && (
        <div className="p-4 sm:p-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Disclaimer Alert */}
          <div className="flex items-start gap-2.5 bg-amber-50/90 border border-amber-200/80 rounded-xl p-3 text-slate-700 text-xs font-medium">
            <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <span className="font-bold text-amber-900">
                Preliminary Guidance:
              </span>{" "}
              This tool provides a preliminary indication only and is not a legal
              patentability assessment.
            </p>
          </div>

      {!isResultScreen ? (
        /* QUESTION VIEW */
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Progress Indicator */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span className="font-mono text-primary font-black uppercase tracking-wider">
                Question {currentStep + 1} of {totalQuestions}
              </span>
              <span>
                {Math.round((currentStep / totalQuestions) * 100)}% Completed
              </span>
            </div>

            {/* Dot & Bar Progress */}
            <div className="flex items-center gap-1.5">
              {QUESTIONS.map((q, idx) => {
                const isAnswered = answers[q.key] !== undefined;
                const isCurrent = idx === currentStep;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleJumpToQuestion(idx)}
                    title={`Jump to Question ${idx + 1}`}
                    className={`h-2 rounded-full transition-all duration-300 flex-1 cursor-pointer ${
                      isCurrent
                        ? "bg-primary ring-2 ring-primary/30"
                        : isAnswered
                          ? "bg-emerald-500 hover:bg-emerald-600"
                          : "bg-slate-200 hover:bg-slate-300"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Question Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200/90 space-y-4">
            <h4 className="text-sm sm:text-base font-black text-[#0B1B3A] font-heading leading-snug break-words">
              {currentQuestion.title}
            </h4>

            {/* Options List */}
            <div className="grid grid-cols-1 gap-2.5">
              {currentQuestion.options.map((opt) => {
                const isSelected = currentAnswer === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectOption(opt.id)}
                    className={`w-full text-left p-3.5 sm:p-4 rounded-xl border text-xs sm:text-sm font-bold transition-all duration-150 flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? "bg-primary text-white border-primary shadow-sm ring-2 ring-primary/20"
                        : "bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50/80"
                    }`}
                  >
                    <span className="break-words flex-1 min-w-0">
                      {opt.label}
                    </span>
                    <div
                      className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "border-white bg-white text-primary"
                          : "border-slate-300 bg-slate-100 text-transparent"
                      }`}
                    >
                      <Check size={12} strokeWidth={3} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleBack}
              disabled={currentStep === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm font-bold transition cursor-pointer shadow-2xs"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={!currentAnswer}
              className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer shadow-xs ${
                currentAnswer
                  ? "bg-primary hover:bg-primary-dark text-white"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              <span>
                {currentStep === totalQuestions - 1
                  ? "Analyze & See Recommendation"
                  : "Continue"}
              </span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* RESULT VIEW */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Main Recommendation Banner Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 size={12} />
                <span>Analysis Complete</span>
              </span>
            </div>

            {/* Dynamic Result State Card */}
            {recommendation.resultType === "TECHNICAL" && (
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-blue-200 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center text-2xl rounded-2xl bg-blue-50 border border-blue-200/80 shadow-inner shrink-0">
                    ⚙️
                  </span>
                  <div>
                    <h4 className="text-base sm:text-lg font-black text-[#0B1B3A] font-heading">
                      Technical Patent May Be Relevant
                    </h4>
                    <p className="text-xs font-black uppercase tracking-wider text-primary mt-0.5">
                      Recommended Category: Patent / Technical Protection
                      (Utility Patent)
                    </p>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium pt-1 border-t border-slate-100">
                  Your answers indicate that the primary innovation appears to
                  be related to the technical functionality, mechanism, process,
                  or operation of your product.
                </p>
              </div>
            )}

            {recommendation.resultType === "DESIGN" && (
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-amber-200 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center text-2xl rounded-2xl bg-amber-50 border border-amber-200/80 shadow-inner shrink-0">
                    🎨
                  </span>
                  <div>
                    <h4 className="text-base sm:text-lg font-black text-[#0B1B3A] font-heading">
                      Design Registration May Be Relevant
                    </h4>
                    <p className="text-xs font-black uppercase tracking-wider text-amber-800 mt-0.5">
                      Recommended Category: Design Registration (Design Patent)
                    </p>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium pt-1 border-t border-slate-100">
                  Your answers indicate that the primary innovation appears to
                  be related to the visual appearance, shape, configuration,
                  pattern, or ornamental features of your product.
                </p>

                {isSoftware && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-bold flex items-start gap-2 mt-2">
                    <Info
                      size={14}
                      className="text-amber-700 shrink-0 mt-0.5"
                    />
                    <span>
                      Notice: For software products in IPL 2026, submissions are
                      processed through the Utility Patent category as Design
                      Registration applies to physical/ornamental articles.
                    </span>
                  </div>
                )}
              </div>
            )}

            {recommendation.resultType === "BOTH" && (
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-purple-200 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center text-2xl rounded-2xl bg-purple-50 border border-purple-200/80 shadow-inner shrink-0">
                    🔐
                  </span>
                  <div>
                    <h4 className="text-base sm:text-lg font-black text-[#0B1B3A] font-heading">
                      Both May Be Relevant
                    </h4>
                    <p className="text-xs font-black uppercase tracking-wider text-purple-800 mt-0.5">
                      Dual Aspect Protection Indicated
                    </p>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium pt-1 border-t border-slate-100">
                  Your product appears to contain both technical innovation and
                  distinctive visual design. Different aspects of the product
                  may potentially require different forms of IP protection:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center gap-2.5">
                    <span className="text-lg">⚙️</span>
                    <div>
                      <span className="text-xs font-black text-[#0B1B3A] block">
                        Patent / Technical Protection
                      </span>
                      <span className="text-[11px] text-slate-600">
                        For functional & mechanical features
                      </span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50 flex items-center gap-2.5">
                    <span className="text-lg">🎨</span>
                    <div>
                      <span className="text-xs font-black text-[#0B1B3A] block">
                        Design Registration
                      </span>
                      <span className="text-[11px] text-slate-600">
                        For shape, aesthetics & visual design
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {recommendation.resultType === "UNCLEAR" && (
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center text-2xl rounded-2xl bg-slate-100 border border-slate-200/80 shadow-inner shrink-0">
                    🤔
                  </span>
                  <div>
                    <h4 className="text-base sm:text-lg font-black text-[#0B1B3A] font-heading">
                      IP Category Needs Further Review
                    </h4>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-600 mt-0.5">
                      Further Assessment Recommended
                    </p>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium pt-1 border-t border-slate-100">
                  Your answers do not clearly indicate a primary IP category.
                  Further review of the invention and its specific features is
                  recommended before selecting an IP protection route.
                </p>
              </div>
            )}

            {/* Score Breakdown Bars */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                Answer Orientation Profile
              </span>
              <div className="space-y-2.5 text-xs font-bold">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-slate-800 font-black">
                      <span>⚙️</span> Technical / Functional Focus:
                    </span>
                    <span className="text-primary font-mono font-black">
                      {recommendation.technicalScore} pts (
                      {recommendation.techPercent}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${recommendation.techPercent}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-slate-800 font-black">
                      <span>🎨</span> Shape / Appearance / Design Focus:
                    </span>
                    <span className="text-amber-800 font-mono font-black">
                      {recommendation.designScore} pts (
                      {recommendation.designPercent}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${recommendation.designPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons to Select Patent Type */}
            <div className="pt-2 border-t border-slate-200 space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                Proceed With Your Selected Category:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Utility Patent Button */}
                <button
                  type="button"
                  onClick={() => handleApplyPatentType("Utility Patent")}
                  className={`p-3.5 rounded-xl border text-left font-black transition-all cursor-pointer flex items-center justify-between gap-3 shadow-sm ${
                    selectedPatentType === "Utility Patent"
                      ? "bg-primary text-white border-primary-dark ring-2 ring-primary/20"
                      : "bg-white hover:bg-slate-50 text-slate-800 border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-lg">⚙️</span>
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm block truncate">
                        Continue with Utility Patent
                      </span>
                      <span
                        className={`text-[10px] block font-bold ${selectedPatentType === "Utility Patent" ? "text-white/80" : "text-slate-500"}`}
                      >
                        {recommendation.resultType === "TECHNICAL" ||
                        recommendation.resultType === "BOTH"
                          ? "★ Recommended based on answers"
                          : "Technical protection"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="shrink-0" />
                </button>

                {/* Design Patent Button */}
                <button
                  type="button"
                  disabled={isSoftware}
                  onClick={() => handleApplyPatentType("Design Patent")}
                  title={
                    isSoftware
                      ? "Design Patent is available only for Hardware submissions."
                      : ""
                  }
                  className={`p-3.5 rounded-xl border text-left font-black transition-all flex items-center justify-between gap-3 shadow-sm ${
                    isSoftware
                      ? "opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200"
                      : selectedPatentType === "Design Patent"
                        ? "bg-accent text-white border-accent-dark ring-2 ring-accent/20 cursor-pointer"
                        : "bg-white hover:bg-slate-50 text-slate-800 border-slate-300 cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-lg">🎨</span>
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm block truncate">
                        Continue with Design Patent
                      </span>
                      <span
                        className={`text-[10px] block font-bold ${selectedPatentType === "Design Patent" ? "text-white/80" : "text-slate-500"}`}
                      >
                        {isSoftware
                          ? "(Hardware Only)"
                          : recommendation.resultType === "DESIGN" ||
                              recommendation.resultType === "BOTH"
                            ? "★ Recommended based on answers"
                            : "Ornamental & design protection"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="shrink-0" />
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Answer Review Drawer / Section */}
          <div className="border border-slate-200 rounded-2xl bg-white p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowReview((prev) => !prev)}
                className="flex items-center gap-2 text-xs sm:text-sm font-black text-slate-800 hover:text-primary transition cursor-pointer"
              >
                <Edit3 size={15} className="text-primary" />
                <span>
                  {showReview ? "Hide Review Answers" : "Review & Edit Answers"}
                </span>
              </button>

              <span className="text-xs font-bold text-slate-500">
                {answeredCount} of {totalQuestions} answered
              </span>
            </div>

            {showReview && (
              <div className="space-y-3 pt-3 border-t border-slate-100 animate-in fade-in duration-150">
                <p className="text-xs text-slate-500 font-medium">
                  Click on any question below to change your answer. Your
                  recommendation will update automatically.
                </p>
                <div className="space-y-2">
                  {QUESTIONS.map((q, idx) => {
                    const ansId = answers[q.key];
                    const selectedOpt = q.options.find((o) => o.id === ansId);
                    return (
                      <div
                        key={q.id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-500 text-[10px] uppercase block mb-0.5">
                            Question {idx + 1}
                          </span>
                          <p className="font-black text-[#0B1B3A] break-words">
                            {q.title}
                          </p>
                          <p className="text-primary font-bold mt-1 bg-white inline-block px-2 py-0.5 rounded border border-slate-200/80">
                            {selectedOpt ? selectedOpt.label : "Not Answered"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleJumpToQuestion(idx)}
                          className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold transition cursor-pointer text-xs shrink-0"
                        >
                          Change
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )}
</div>
);
}
