import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  Leaf,
  Lightbulb,
  LockKeyhole,
  Map,
  Menu,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { lessons, modules } from './data/modules'
import { blankIntake, generatePlan } from './lib/personalization'
import { createBloomPersistence } from './lib/persistence'
import { createRemotePlan, getRemotePlan, markRemoteLessonComplete, readRemotePlanRef, remotePersistenceConfigured, writeRemotePlanRef, type RemotePlanRef } from './lib/remote'
import type { Challenge, Goal, IntakeData, LearningFormat, LearnerType, LearningPlan, Level } from './types'
import './styles.css'

const COMPLETED_KEY = 'bloom-it-completed-lessons'
const persistence = createBloomPersistence()

type Navigate = (to: string) => void

type IconType = typeof ArrowRight

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function App() {
  const [path, setPath] = useState(() => window.location.pathname)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [intake, setIntake] = useState<IntakeData>(() => persistence.intake.read())
  const [plan, setPlan] = useState<LearningPlan | null>(() => persistence.plan.read())
  const [remoteRef, setRemoteRef] = useState<RemotePlanRef | null>(() => readRemotePlanRef())

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    persistence.intake.write(intake)
  }, [intake])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    setMobileOpen(false)
    const title = path === '/' ? 'Bloom It — Learning that starts with you' : `Bloom It — ${path.slice(1).split('/')[0].replace('-', ' ')}`
    document.title = title
  }, [path])

  useEffect(() => {
    if (!remoteRef || !remotePersistenceConfigured()) return
    let active = true
    getRemotePlan(remoteRef).then((saved) => {
      if (!active) return
      setPlan(saved.plan)
      persistence.plan.write(saved.plan)
      const localCompleted = readStorage<string[]>(COMPLETED_KEY, [])
      const merged = [...new Set([...localCompleted, ...saved.completedLessons])]
      try { window.localStorage.setItem(COMPLETED_KEY, JSON.stringify(merged)) } catch { /* local prototype storage can be unavailable */ }
    }).catch(() => {
      // Keep the last local plan visible if a remote request is temporarily unavailable.
    })
    return () => { active = false }
  }, [remoteRef])

  const navigate: Navigate = (to) => {
    if (to.startsWith('#')) {
      document.querySelector(to)?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    window.history.pushState({}, '', to)
    setPath(to.split('#')[0] || '/')
  }

  const savePlan = (nextPlan: LearningPlan, nextRemoteRef: RemotePlanRef | null = null) => {
    setPlan(nextPlan)
    setRemoteRef(nextRemoteRef)
    writeRemotePlanRef(nextRemoteRef)
    persistence.plan.write(nextPlan)
  }

  const lessonMatch = path.match(/^\/lesson\/([^/]+)/)
  let content: React.ReactNode
  if (path === '/') content = <HomePage navigate={navigate} />
  else if (path === '/personalize' || path === '/build-my-path') content = <IntakePage intake={intake} setIntake={setIntake} navigate={navigate} onPlan={savePlan} />
  else if (path === '/plan') content = <PlanPage plan={plan} navigate={navigate} />
  else if (path === '/course') content = <CoursePage navigate={navigate} />
  else if (lessonMatch) content = <LessonPage lessonId={decodeURIComponent(lessonMatch[1])} navigate={navigate} remoteRef={remoteRef} />
  else if (path === '/privacy') content = <LegalPage type="privacy" navigate={navigate} />
  else if (path === '/terms') content = <LegalPage type="terms" navigate={navigate} />
  else content = <NotFound navigate={navigate} />

  return (
    <div className="app-shell">
      <Header path={path} navigate={navigate} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main>{content}</main>
      <Footer navigate={navigate} />
    </div>
  )
}

function Header({ path, navigate, mobileOpen, setMobileOpen }: { path: string; navigate: Navigate; mobileOpen: boolean; setMobileOpen: (open: boolean) => void }) {
  const linkClass = (active: boolean) => active ? 'nav-link active' : 'nav-link'
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/') }} aria-label="Bloom It home">
          <span className="brand-mark"><Leaf size={17} strokeWidth={2.4} /></span>
          <span>Bloom<span className="brand-dot">.</span>it</span>
        </a>
        <nav className={mobileOpen ? 'main-nav open' : 'main-nav'} aria-label="Main navigation">
          <a className={linkClass(path === '/')} href="/#how-it-works">How it works</a>
          <a className={linkClass(path === '/course')} href="/course" onClick={(event) => { event.preventDefault(); navigate('/course') }}>Explore learning</a>
          <a className="nav-link" href="/#why-bloom-it">Why Bloom It</a>
          <a className="nav-link" href="/#faq">FAQ</a>
          <button className="button button-small button-dark nav-cta" onClick={() => navigate('/personalize')}>Build my path <ArrowUpRight size={15} /></button>
        </nav>
        <button className="menu-toggle" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>
  )
}

function Footer({ navigate }: { navigate: Navigate }) {
  return (
    <footer className="site-footer">
      <div className="container footer-top">
        <div className="footer-brand">
          <a className="brand brand-light" href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}><span className="brand-mark"><Leaf size={17} strokeWidth={2.4} /></span><span>Bloom<span className="brand-dot">.</span>it</span></a>
          <p>A learning path shaped around the person taking it.</p>
        </div>
        <div className="footer-links">
          <div><p className="footer-label">Explore</p><a href="/#how-it-works">How it works</a><a href="/course" onClick={(event) => { event.preventDefault(); navigate('/course') }}>English course</a><a href="/#faq">FAQ</a></div>
          <div><p className="footer-label">Company</p><a href="/#why-bloom-it">Why Bloom It</a><a href="/privacy" onClick={(event) => { event.preventDefault(); navigate('/privacy') }}>Privacy</a><a href="/terms" onClick={(event) => { event.preventDefault(); navigate('/terms') }}>Terms</a></div>
        </div>
        <div className="footer-action"><p>Start with what you need today.</p><button className="button button-light" onClick={() => navigate('/personalize')}>Build my path <ArrowRight size={16} /></button></div>
      </div>
      <div className="container footer-bottom"><span>© 2025 Bloom It. Built as a thoughtful learning prototype.</span><span>Made for learners in the UAE, US and everywhere in between.</span></div>
    </footer>
  )
}

function HomePage({ navigate }: { navigate: Navigate }) {
  const [previewAnswer, setPreviewAnswer] = useState<string | null>(null)
  const [profile, setProfile] = useState(0)
  const profiles = [
    { name: 'The shy speaker', color: 'coral', quote: 'I understand English, but I freeze when it is my turn to speak.', modules: ['Find your speaking rhythm', 'Respond without freezing', 'Make sentences feel natural'] },
    { name: 'The career builder', color: 'lavender', quote: 'I want my experience to sound as strong in an interview as it is on paper.', modules: ['Tell your story in interviews', 'Contribute at work', 'Make sentences feel natural'] },
    { name: 'The everyday learner', color: 'sage', quote: 'I want everyday conversations to feel less like a test and more like life.', modules: ['Make sentences feel natural', 'Put the right word in reach', 'Catch the meaning, not every word'] },
    { name: 'The confident presenter', color: 'sun', quote: 'I have ideas to share. I want the language and delivery to match.', modules: ['Present with purpose', 'Speak with more clarity', 'Make progress stick'] },
  ]
  const activeProfile = profiles[profile]
  return (
    <>
      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> Learning that starts with you</div>
            <h1>Your goals.<br /><em>Your way</em> of learning.</h1>
            <p className="hero-lede">Tell us what you want to achieve, where you are getting stuck, and how you like to learn. Bloom It shapes a focused English path around your real life.</p>
            <div className="hero-actions"><button className="button button-primary" onClick={() => navigate('/personalize')}>Build my learning path <ArrowUpRight size={17} /></button><a className="text-link" href="/course" onClick={(event) => { event.preventDefault(); navigate('/course') }}>Explore English speaking <ArrowRight size={16} /></a></div>
            <div className="hero-note"><span className="tiny-avatars"><span>R</span><span>M</span><span>A</span></span><span>A calmer place to begin.</span></div>
          </div>
          <div className="hero-art" aria-label="A preview of an adaptable learning path">
            <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
            <div className="art-sun"><span>your<br />starting<br />point</span><Sparkles size={17} /></div>
            <div className="path-line path-line-one" /><div className="path-line path-line-two" /><div className="path-line path-line-three" />
            <div className="path-node node-one"><span className="node-index">01</span><span>Speak<br />with ease</span></div>
            <div className="path-node node-two"><span className="node-index">02</span><span>Find the<br />right words</span></div>
            <div className="path-node node-three"><span className="node-index">03</span><span>Show up<br />with clarity</span></div>
            <div className="art-caption"><span className="caption-dot" /> Your path changes with you</div>
          </div>
        </div>
        <div className="hero-scribble" aria-hidden="true">designed around <span>you</span> ↗</div>
      </section>

      <section className="logo-strip"><div className="container logo-strip-inner"><span>One course.</span><span>Many ways forward.</span><span className="strip-divider" /><span>English speaking & communication</span><span className="strip-status"><span /> structured, not generic</span></div></section>

      <section className="section problem-section" id="why-bloom-it">
        <div className="container split-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> The old way feels backwards</div><h2>Learning should meet you<br /><em>where you are.</em></h2></div><p>Most courses begin with a syllabus. Bloom It begins with a conversation about you — so every next step has a reason to be there.</p></div>
        <div className="container problem-grid"><ProblemCard number="01" title="The right start is unclear" text="You know you want to improve, but not which skill to work on first." icon={Compass} /><ProblemCard number="02" title="Practice stays theoretical" text="Lessons make sense on screen, then disappear in a real conversation." icon={Lightbulb} /><ProblemCard number="03" title="Progress has no rhythm" text="A rigid schedule asks you to fit the course, instead of fitting your life." icon={Clock3} /></div>
      </section>

      <section className="section how-section" id="how-it-works">
        <div className="container section-heading centered"><div className="eyebrow"><span className="eyebrow-line" /> A gentler way forward</div><h2>Start with the <em>why.</em><br />We’ll help with the what.</h2><p>One thoughtful intake turns a broad goal into your next few useful steps.</p></div>
        <div className="container steps-grid"><Step number="01" title="Tell us about yourself" text="Share your goals, current level, challenges and the time you actually have." color="coral" /><Step number="02" title="Get your learning path" text="Our transparent matching engine connects your answers to the modules that fit." color="lavender" /><Step number="03" title="Practise what matters" text="Follow focused lessons and real-life exercises, one clear step at a time." color="sage" /></div>
        <div className="container how-foot"><span className="how-foot-line" /><span>About 3 minutes to a clearer next step</span><span className="how-foot-line" /></div>
      </section>

      <section className="section showcase-section">
        <div className="container showcase-grid">
          <div className="showcase-copy"><div className="eyebrow"><span className="eyebrow-line" /> One course, your emphasis</div><h2>The same destination.<br /><em>A different route.</em></h2><p>There is no single “good learner” profile. Explore how the path shifts when the person, context and goal change.</p><div className="profile-tabs" role="tablist" aria-label="Example learner profiles">{profiles.map((item, index) => <button key={item.name} role="tab" aria-selected={profile === index} className={profile === index ? 'profile-tab selected' : 'profile-tab'} onClick={() => setProfile(index)}><span className={`profile-dot ${item.color}`} />{item.name}</button>)}</div></div>
          <div className="profile-card-wrap"><div className={`profile-card ${activeProfile.color}`}><div className="profile-card-top"><span className="profile-kicker">Illustrative learner profile</span><span className="profile-count">0{profile + 1} / 04</span></div><div className="profile-quote">“{activeProfile.quote}”</div><div className="profile-path-label"><span>Bloom It would prioritise</span><span className="mini-arrow">↘</span></div><div className="profile-modules">{activeProfile.modules.map((module, index) => <div className="profile-module" key={module}><span>0{index + 1}</span><b>{module}</b><ArrowUpRight size={16} /></div>)}</div></div><div className="profile-orbit" /></div>
        </div>
      </section>

      <section className="section course-section">
        <div className="container course-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> Your first Bloom It course</div><h2>English for the<br /><em>life you’re living.</em></h2></div><div><p>Not a promise to become someone else. A practical place to build the words, confidence and clarity you want to bring into your day.</p><button className="text-link text-link-dark" onClick={() => navigate('/course')}>Explore the course <ArrowRight size={16} /></button></div></div>
        <div className="container module-ribbon"><div className="ribbon-label">The course can meet you in</div><div className="ribbon-items"><span>Everyday conversation</span><span>Workplace English</span><span>Interview preparation</span><span>Presentations</span><span>+ your own goal</span></div></div>
      </section>

      <section className="section preview-section">
        <div className="container preview-grid"><div className="preview-intro"><div className="eyebrow"><span className="eyebrow-line" /> Try a small moment</div><h2>Progress can feel<br /><em>practical.</em></h2><p>A tiny preview of the way Bloom It teaches: useful context, a clear choice, and feedback you can use straight away.</p><div className="preview-meta"><span><BookOpen size={15} /> Sample lesson</span><span><Clock3 size={15} /> 2 minutes</span></div></div><div className="exercise-card"><div className="exercise-top"><span className="exercise-label">WORKPLACE CONVERSATION</span><span className="exercise-step">01 / 01</span></div><h3>You need a moment to answer a question in a meeting. What helps you stay in the conversation?</h3><div className="exercise-options">{['No.', 'That’s a good question. Let me think about that for a moment.', 'I don’t know English.'].map((answer) => <button key={answer} className={previewAnswer === answer ? `exercise-option ${answer.startsWith('That') ? 'correct' : 'incorrect'}` : 'exercise-option'} onClick={() => setPreviewAnswer(answer)}><span className="option-letter">{String.fromCharCode(65 + ['No.', 'That’s a good question. Let me think about that for a moment.', 'I don’t know English.'].indexOf(answer))}</span><span>{answer}</span>{previewAnswer === answer && <span className="option-check">{answer.startsWith('That') ? <Check size={15} /> : <X size={15} />}</span>}</button>)}</div>{previewAnswer && <div className={previewAnswer.startsWith('That') ? 'exercise-feedback good' : 'exercise-feedback'}><strong>{previewAnswer.startsWith('That') ? 'That keeps you moving.' : 'Try a bridge phrase instead.'}</strong><span>{previewAnswer.startsWith('That') ? 'A short thinking phrase gives you time without dropping out of the conversation.' : 'A small phrase like “That’s a good question” buys you time and keeps the exchange open.'}</span></div>}</div></div>
      </section>

      <section className="section why-section">
        <div className="container why-grid"><div className="why-statement"><div className="eyebrow"><span className="eyebrow-line" /> Why Bloom It</div><h2>Useful before<br /><em>impressive.</em></h2><p>Personalisation should be something you can see, understand and act on — not a mysterious label attached to a generic course.</p></div><div className="why-list"><WhyItem icon={Target} title="Goal-led" text="Your reason for learning shapes the modules we put first." /><WhyItem icon={Map} title="Transparent" text="See what was recommended and why it matches your answers." /><WhyItem icon={ShieldCheck} title="Human-sized" text="A realistic rhythm for the time and energy you actually have." /><WhyItem icon={Sparkles} title="Ready to grow" text="A structured foundation that can evolve with better signals over time." /></div></div>
      </section>

      <section className="section future-section"><div className="container future-inner"><div className="future-copy"><div className="eyebrow"><span className="eyebrow-line" /> A wider horizon</div><h2>One thoughtful start.<br /><em>More ways to grow.</em></h2><p>English is where Bloom It begins. The same personalisation-first approach can eventually support the skills and seasons that come next.</p></div><div className="future-map"><div className="future-center"><Leaf size={24} /> Bloom It</div><div className="future-branch branch-one"><span>Career skills</span><i /></div><div className="future-branch branch-two"><span>Academic support</span><i /></div><div className="future-branch branch-three"><span>Digital skills</span><i /></div></div></div></section>

      <section className="section faq-section" id="faq"><div className="container faq-grid"><div><div className="eyebrow"><span className="eyebrow-line" /> Clear answers</div><h2>Questions are<br /><em>welcome here.</em></h2><p>If you are wondering about it, someone else probably is too.</p><button className="text-link text-link-dark" onClick={() => navigate('/personalize')}>Still curious? Start your path <ArrowRight size={16} /></button></div><FaqList /></div></section>

      <section className="final-cta"><div className="final-cta-orbit orbit-left" /><div className="final-cta-orbit orbit-right" /><div className="container final-cta-inner"><div className="eyebrow eyebrow-light"><span className="eyebrow-line" /> Your next step can be small</div><h2>Start with where<br /><em>you are.</em></h2><p>Three minutes of honest answers. One clearer way forward.</p><button className="button button-light" onClick={() => navigate('/personalize')}>Build my learning path <ArrowUpRight size={17} /></button></div></section>
    </>
  )
}

function ProblemCard({ number, title, text, icon: Icon }: { number: string; title: string; text: string; icon: IconType }) {
  return <article className="problem-card"><div className="problem-card-top"><span>{number}</span><Icon size={22} strokeWidth={1.6} /></div><h3>{title}</h3><p>{text}</p></article>
}
function Step({ number, title, text, color }: { number: string; title: string; text: string; color: string }) {
  return <article className="step-card"><div className={`step-number ${color}`}>{number}</div><div className="step-card-line" /><h3>{title}</h3><p>{text}</p><span className="step-arrow">↗</span></article>
}
function WhyItem({ icon: Icon, title, text }: { icon: IconType; title: string; text: string }) {
  return <div className="why-item"><div className="why-icon"><Icon size={20} /></div><div><h3>{title}</h3><p>{text}</p></div></div>
}

const faqItems = [
  ['How does personalised learning work?', 'You tell us about your goals, current level, challenges and available time. The first Bloom It version uses a transparent rules-based engine to match those answers to a structured set of English modules.'],
  ['Is Bloom It suitable for beginners?', 'Yes. You can choose complete beginner, basic, or not sure. Your plan can start with speaking foundations and sentence patterns before moving into more specialised practice.'],
  ['Can working professionals use it?', 'Yes. Workplace communication, interview answers and presentations are part of the first course catalogue, with flexible time options for busy schedules.'],
  ['Does Bloom It currently use AI?', 'Not in this first version. Your plan is generated by a deterministic matching engine, so the recommendations are explainable. The architecture is ready for future providers, but no AI API call is made today.'],
  ['How long will my learning plan take?', 'Your plan estimates module time and suggests a weekly rhythm from the time you choose. It does not promise a particular English level by a deadline.'],
  ['Is my information protected?', 'This deployable prototype stores intake and plan data in your browser’s local storage so you can revisit it on the same device. It is not a cloud account or a backup. See the Privacy page for details.'],
  ['Which courses are available today?', 'English Speaking & Communication is the active course. Career, academic and digital skills are future possibilities, not available courses yet.'],
]
function FaqList() {
  const [open, setOpen] = useState(0)
  return <div className="faq-list">{faqItems.map(([question, answer], index) => <div className={open === index ? 'faq-item open' : 'faq-item'} key={question}><button className="faq-question" aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}><span>{question}</span><span className="faq-toggle">{open === index ? <X size={16} /> : <ChevronDown size={17} />}</span></button>{open === index && <p className="faq-answer">{answer}</p>}</div>)}</div>
}

const goalOptions: { value: Goal; label: string }[] = [
  { value: 'confidence', label: 'Speaking confidently' }, { value: 'everyday', label: 'Everyday conversations' }, { value: 'fluency', label: 'English fluency' }, { value: 'pronunciation', label: 'Pronunciation and clarity' }, { value: 'vocabulary', label: 'Vocabulary' }, { value: 'grammar', label: 'Grammar and sentence formation' }, { value: 'listening', label: 'Listening comprehension' }, { value: 'workplace', label: 'Workplace communication' }, { value: 'interviews', label: 'Job interviews' }, { value: 'presentations', label: 'Presentations and public speaking' }, { value: 'academic', label: 'Academic communication' }, { value: 'other-goal', label: 'Something else' },
]
const challengeOptions: { value: Challenge; label: string }[] = [
  { value: 'hesitation', label: 'I understand English but hesitate to speak' }, { value: 'translate', label: 'I translate in my head before speaking' }, { value: 'word-recall', label: 'I forget words during conversations' }, { value: 'pronunciation', label: 'I struggle with pronunciation' }, { value: 'grammar-mistakes', label: 'I make frequent grammar mistakes' }, { value: 'limited-practice', label: 'I have limited opportunities to practise' }, { value: 'application', label: 'I understand lessons but struggle to apply them' }, { value: 'accents', label: 'I struggle with different accents' }, { value: 'nervous', label: 'I feel nervous about making mistakes' }, { value: 'generic-courses', label: 'Existing courses feel too generic' }, { value: 'starting-point', label: 'I do not know what to learn first' }, { value: 'routine', label: 'I cannot maintain a consistent routine' }, { value: 'other-challenge', label: 'Something else' },
]

function IntakePage({ intake, setIntake, navigate, onPlan }: { intake: IntakeData; setIntake: React.Dispatch<React.SetStateAction<IntakeData>>; navigate: Navigate; onPlan: (plan: LearningPlan, remoteRef?: RemotePlanRef | null) => void }) {
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const update = <K extends keyof IntakeData>(key: K, value: IntakeData[K]) => setIntake((current) => ({ ...current, [key]: value }))
  const toggle = <K extends 'goals' | 'challenges' | 'formats'>(key: K, value: IntakeData[K][number]) => setIntake((current) => {
    const values = current[key] as string[]
    const next = values.includes(value as string) ? values.filter((item) => item !== value) : [...values, value as string]
    return { ...current, [key]: next } as IntakeData
  })
  const validate = () => {
    if (step === 1 && (!intake.name.trim() || !/^\S+@\S+\.\S+$/.test(intake.email) || !intake.country || !intake.learnerType)) return 'Add your name, a valid email, country and learner type to continue.'
    if (step === 2 && (!intake.goals.length || !intake.success.trim())) return 'Choose at least one goal and describe what success would look like for you.'
    if (step === 3 && !intake.challenges.length) return 'Choose at least one difficulty. You can add more context in your own words if you like.'
    if (step === 4 && !intake.level) return 'Choose the level that feels closest. “Not sure” is a good answer too.'
    if (step === 5 && (!intake.time || !intake.schedule || !intake.formats.length || !intake.pace)) return 'Choose your time, schedule, preferred format and pace so we can make the plan realistic.'
    if (step === 6 && !intake.consent) return 'Please confirm that Bloom It can use these answers to prepare your learning plan.'
    return ''
  }
  const next = () => { const message = validate(); if (message) { setError(message); return } setError(''); setStep(Math.min(6, step + 1)) }
  const previous = () => { setError(''); setStep(Math.max(1, step - 1)) }
  const submit = async () => {
    const message = validate()
    if (message) { setError(message); return }
    setSubmitting(true)
    setError('')
    try {
      if (remotePersistenceConfigured()) {
        const remote = await createRemotePlan(intake)
        onPlan(remote.plan, remote.ref)
      } else {
        onPlan(generatePlan(intake), null)
      }
      navigate('/plan')
    } catch (submissionError) {
      setSubmitting(false)
      setError(submissionError instanceof Error ? submissionError.message : 'We could not create your path. Please check your answers and try again.')
    }
  }
  const progress = `${Math.round((step / 6) * 100)}%`
  return <section className="intake-page"><div className="container intake-shell"><div className="intake-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Build a path around you</div><h1>A few honest answers.<br /><em>A clearer next step.</em></h1></div><p>This is not a test. It is a short conversation that helps us understand what would be useful for you right now.</p></div><div className="intake-layout"><aside className="intake-aside"><div className="intake-progress-label"><span>Your path</span><span>{step} of 6</span></div><div className="progress-rail"><div className="progress-fill" style={{ height: progress }} /></div><div className="step-list">{['About you', 'Your goals', 'The difficulty', 'Your level', 'Your rhythm', 'Review & consent'].map((label, index) => <div className={step === index + 1 ? 'intake-step current' : step > index + 1 ? 'intake-step complete' : 'intake-step'} key={label}><span>{step > index + 1 ? <Check size={13} /> : `0${index + 1}`}</span>{label}</div>)}</div><div className="intake-aside-note"><LockKeyhole size={16} /><span>Your answers stay in this browser for this prototype. You can edit them before creating your path.</span></div></aside><div className="intake-card"><div className="intake-card-top"><span className="mobile-step-label">Step {step} / 6</span><span className="intake-time">Takes about 3 minutes</span></div>{step === 1 && <AboutStep intake={intake} update={update} />}{step === 2 && <GoalsStep intake={intake} update={update} toggle={toggle} />}{step === 3 && <DifficultyStep intake={intake} update={update} toggle={toggle} />}{step === 4 && <LevelStep intake={intake} update={update} />}{step === 5 && <RhythmStep intake={intake} update={update} toggle={toggle} />}{step === 6 && <ReviewStep intake={intake} update={update} navigate={navigate} onEdit={setStep} />}{error && <div className="form-error" role="alert"><AlertCircle size={17} />{error}</div>}<div className="intake-actions"><button className="button button-quiet" onClick={previous} disabled={step === 1}><ChevronLeft size={17} /> Back</button>{step < 6 ? <button className="button button-primary" onClick={next}>Continue <ChevronRight size={17} /></button> : <button className="button button-primary" onClick={submit} disabled={submitting}>{submitting ? 'Creating your path…' : 'Create my learning path'} {!submitting && <ArrowUpRight size={17} />}</button>}</div></div></div></div></section>
}

function IntakeTitle({ kicker, title, copy }: { kicker: string; title: string; copy: string }) { return <div className="form-heading"><span className="form-kicker">{kicker}</span><h2>{title}</h2><p>{copy}</p></div> }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="field"><span className="field-label">{label}{hint && <small>{hint}</small>}</span>{children}</label> }
function AboutStep({ intake, update }: { intake: IntakeData; update: <K extends keyof IntakeData>(key: K, value: IntakeData[K]) => void }) { return <><IntakeTitle kicker="01 / About you" title="Let’s start with the person learning." copy="Only share what helps us shape a more useful path." /><div className="form-grid two"><Field label="Your name"><input value={intake.name} onChange={(event) => update('name', event.target.value)} placeholder="What should we call you?" autoComplete="name" /></Field><Field label="Email address"><input type="email" value={intake.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" autoComplete="email" /></Field><Field label="Where are you based?"><select value={intake.country} onChange={(event) => update('country', event.target.value)}><option value="">Choose a country or region</option><option value="UAE">United Arab Emirates</option><option value="US">United States</option><option value="India">India</option><option value="Other">Other country</option></select></Field><Field label="Which sounds most like you?"><select value={intake.learnerType} onChange={(event) => update('learnerType', event.target.value as LearnerType)}><option value="">Choose one</option><option value="school-student">School student</option><option value="university-student">University student</option><option value="job-seeker">Job seeker</option><option value="working-professional">Working professional</option><option value="parent-guardian">Parent / guardian</option><option value="other">Something else</option></select></Field><Field label="How would you like explanations?" hint="Optional"><select value={intake.explanationLanguage} onChange={(event) => update('explanationLanguage', event.target.value)}><option>English</option><option>Arabic</option><option>Hindi</option><option>Urdu</option><option>Another language</option></select></Field></div></> }
function GoalsStep({ intake, update, toggle }: { intake: IntakeData; update: <K extends keyof IntakeData>(key: K, value: IntakeData[K]) => void; toggle: <K extends 'goals' | 'challenges' | 'formats'>(key: K, value: IntakeData[K][number]) => void }) { return <><IntakeTitle kicker="02 / Your goals" title="What would you most like to improve?" copy="Pick as many as feel relevant. Your priorities help us decide what comes first." /><div className="choice-grid">{goalOptions.map((option) => <Choice key={option.value} label={option.label} selected={intake.goals.includes(option.value)} onClick={() => toggle('goals', option.value)} />)}</div><Field label="What would success look like for you?" hint="A sentence or two is perfect"><textarea value={intake.success} onChange={(event) => update('success', event.target.value)} placeholder="For example: I want to speak confidently with my colleagues without translating every sentence..." rows={4} /></Field></> }
function DifficultyStep({ intake, update, toggle }: { intake: IntakeData; update: <K extends keyof IntakeData>(key: K, value: IntakeData[K]) => void; toggle: <K extends 'goals' | 'challenges' | 'formats'>(key: K, value: IntakeData[K][number]) => void }) { return <><IntakeTitle kicker="03 / The difficulty" title="What makes English difficult right now?" copy="This is the most useful part. Choose the moments that feel familiar, then tell us the rest in your own words." /><div className="choice-grid compact">{challengeOptions.map((option) => <Choice key={option.value} label={option.label} selected={intake.challenges.includes(option.value)} onClick={() => toggle('challenges', option.value)} />)}</div><Field label="Tell us in your own words" hint="Optional"><textarea className="tall" value={intake.challengeDetail} onChange={(event) => update('challengeDetail', event.target.value)} placeholder="What have you struggled with, what have you tried before, and what do you wish existing courses did differently?" rows={6} /></Field></> }
function LevelStep({ intake, update }: { intake: IntakeData; update: <K extends keyof IntakeData>(key: K, value: IntakeData[K]) => void }) { const levels: { value: Level; label: string; text: string }[] = [{ value: 'complete-beginner', label: 'Complete beginner', text: 'I am just starting.' }, { value: 'basic', label: 'Basic English', text: 'I know familiar words and phrases.' }, { value: 'lower-intermediate', label: 'Lower intermediate', text: 'I can manage simple conversations.' }, { value: 'intermediate', label: 'Intermediate', text: 'I can explain most everyday ideas.' }, { value: 'upper-intermediate', label: 'Upper intermediate', text: 'I communicate well, with some gaps.' }, { value: 'advanced', label: 'Advanced', text: 'I want to sharpen specific skills.' }, { value: 'not-sure', label: 'Not sure yet', text: 'Help me find a useful starting point.' }]; return <><IntakeTitle kicker="04 / Your current level" title="Which feels closest today?" copy="This is a self-estimate, not a formal assessment. There is no wrong answer." /><div className="level-list">{levels.map((level) => <button className={intake.level === level.value ? 'level-option selected' : 'level-option'} key={level.value} onClick={() => update('level', level.value)}><span className="radio-dot">{intake.level === level.value && <span />}</span><span><b>{level.label}</b><small>{level.text}</small></span><ChevronRight size={17} /></button>)}</div><div className="self-check"><p className="field-label">A quick self-check <small>Optional</small></p><div className="self-check-row"><span>Can you introduce yourself in English?</span><select value={intake.selfAssessment.introduction} onChange={(event) => update('selfAssessment', { ...intake.selfAssessment, introduction: event.target.value as 'yes' | 'sometimes' | 'not-yet' })}><option value="yes">Yes</option><option value="sometimes">Sometimes</option><option value="not-yet">Not yet</option></select></div><div className="self-check-row"><span>Can you hold a short everyday conversation?</span><select value={intake.selfAssessment.conversation} onChange={(event) => update('selfAssessment', { ...intake.selfAssessment, conversation: event.target.value as 'yes' | 'sometimes' | 'not-yet' })}><option value="yes">Yes</option><option value="sometimes">Sometimes</option><option value="not-yet">Not yet</option></select></div></div></> }
function RhythmStep({ intake, update, toggle }: { intake: IntakeData; update: <K extends keyof IntakeData>(key: K, value: IntakeData[K]) => void; toggle: <K extends 'goals' | 'challenges' | 'formats'>(key: K, value: IntakeData[K][number]) => void }) { const formats: { value: LearningFormat; label: string }[] = [{ value: 'short-lessons', label: 'Short lessons' }, { value: 'guided-practice', label: 'Guided practice' }, { value: 'examples', label: 'Examples' }, { value: 'reading', label: 'Reading' }, { value: 'quizzes', label: 'Quizzes' }, { value: 'scenarios', label: 'Real-life scenarios' }]; return <><IntakeTitle kicker="05 / Your rhythm" title="What can your learning fit around?" copy="A good plan respects your time. Choose the rhythm you are most likely to keep." /><div className="form-grid two"><Field label="Available study time"><select value={intake.time} onChange={(event) => update('time', event.target.value as IntakeData['time'])}><option value="">Choose daily time</option><option value="10-15">10–15 minutes</option><option value="20-30">20–30 minutes</option><option value="30-45">30–45 minutes</option><option value="45-plus">45+ minutes</option></select></Field><Field label="Preferred schedule"><select value={intake.schedule} onChange={(event) => update('schedule', event.target.value as IntakeData['schedule'])}><option value="">Choose a rhythm</option><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="flexible">Flexible</option></select></Field><Field label="Preferred pace"><select value={intake.pace} onChange={(event) => update('pace', event.target.value as IntakeData['pace'])}><option value="">Choose a pace</option><option value="gradual">Gradual and gentle</option><option value="balanced">Balanced</option><option value="intensive">Intensive focus</option></select></Field><Field label="Target date" hint="Optional"><input type="date" value={intake.deadline} onChange={(event) => update('deadline', event.target.value)} /></Field></div><p className="field-label formats-label">What helps you learn best? <small>Choose any</small></p><div className="choice-grid format-grid">{formats.map((format) => <Choice key={format.value} label={format.label} selected={intake.formats.includes(format.value)} onClick={() => toggle('formats', format.value)} />)}</div><Field label="Anything else we should know?" hint="Optional"><textarea value={intake.context} onChange={(event) => update('context', event.target.value)} placeholder="A situation, deadline or learning preference you want us to keep in mind..." rows={3} /></Field></> }
function ReviewStep({ intake, update, navigate, onEdit }: { intake: IntakeData; update: <K extends keyof IntakeData>(key: K, value: IntakeData[K]) => void; navigate: Navigate; onEdit: (step: number) => void }) { const readable = (value: string) => value.replaceAll('-', ' '); return <><IntakeTitle kicker="06 / Review & consent" title="This is what we heard." copy="Take a moment to check your answers. You can go back and edit anything before creating your path." /><div className="review-list"><ReviewRow title="About you" value={`${intake.name || 'Not added'} · ${intake.country || 'Country not added'} · ${intake.learnerType ? readable(intake.learnerType) : 'Learner type not added'}`} onClick={() => onEdit(1)} /><ReviewRow title="Your goals" value={`${intake.goals.length ? intake.goals.map((goal) => goalOptions.find((item) => item.value === goal)?.label).join(', ') : 'No goals selected'}${intake.success ? ` · Success: ${intake.success}` : ''}`} onClick={() => onEdit(2)} /><ReviewRow title="Your difficulty" value={`${intake.challenges.length ? `${intake.challenges.length} challenge${intake.challenges.length > 1 ? 's' : ''} selected` : 'No challenges selected'}${intake.challengeDetail ? ` · “${intake.challengeDetail}”` : ''}`} onClick={() => onEdit(3)} /><ReviewRow title="Your rhythm" value={`${intake.time ? readable(intake.time) + ' minutes' : 'Time not added'} · ${intake.schedule || 'schedule not added'} · ${intake.pace || 'pace not added'}`} onClick={() => onEdit(5)} /></div><div className="consent-box"><label className="check-label"><input type="checkbox" checked={intake.consent} onChange={(event) => update('consent', event.target.checked)} /><span className="fake-check"><Check size={13} /></span><span>I agree that Bloom It may use the information I shared to prepare this learning plan. <a href="/privacy" onClick={(event) => { event.preventDefault(); navigate('/privacy') }}>Read the privacy note.</a></span></label><label className="check-label optional"><input type="checkbox" checked={intake.marketing} onChange={(event) => update('marketing', event.target.checked)} /><span className="fake-check"><Check size={13} /></span><span>I would like occasional updates about Bloom It. <small>Optional — not required to create your path.</small></span></label></div><div className="review-note"><ShieldCheck size={17} /><span>We will create a plan from the structured Bloom It course catalogue. No LLM or external AI service is called in this version.</span></div></> }
function ReviewRow({ title, value, onClick }: { title: string; value: string; onClick: () => void }) { return <div className="review-row"><div><span>{title}</span><b>{value}</b></div><button onClick={onClick} aria-label={`Edit ${title}`}>Edit</button></div> }
function Choice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) { return <button type="button" className={selected ? 'choice selected' : 'choice'} aria-pressed={selected} onClick={onClick}><span className="choice-check"><Check size={13} /></span>{label}</button> }

function PlanPage({ plan, navigate }: { plan: LearningPlan | null; navigate: Navigate }) {
  const completed = readStorage<string[]>(COMPLETED_KEY, [])
  if (!plan) return <EmptyPlan navigate={navigate} />
  return <section className="plan-page"><div className="container"><div className="plan-hero"><div><div className="eyebrow"><span className="eyebrow-line" /> Your Bloom It path</div><h1>A path made for<br /><em>{plan.learnerName}.</em></h1><p>{plan.summary}</p></div><div className="plan-badge"><Sparkles size={18} /><span>Structured around<br /><b>your answers</b></span></div></div><div className="plan-overview"><div className="overview-card overview-main"><span className="overview-label">Your focus</span><div className="priority-pills">{plan.priorities.map((priority) => <span key={priority}>{priority}</span>)}</div><p>We put these at the centre of your first set of lessons, then added supporting practice so you can use what you learn.</p></div><div className="overview-card"><span className="overview-label">Suggested rhythm</span><strong>{plan.weeklyMinutes} <small>min / week</small></strong><p>{plan.weeklyPlan}</p></div><div className="overview-card"><span className="overview-label">Path progress</span><strong>{completed.filter((id) => plan.modules.some((module) => module.lessonId === id)).length}<small> / {plan.modules.length} lessons</small></strong><p>Start with the first lesson, or jump to the situation that matters most today.</p></div></div>{plan.learnerContext && (plan.learnerContext.challengeDetail || plan.learnerContext.success || plan.learnerContext.context) && <div className="personal-context"><span className="overview-label">Your context, kept in the plan</span><h3>We heard the details behind your goal.</h3>{plan.learnerContext.success && <p><b>Success looks like:</b> {plan.learnerContext.success}</p>}{plan.learnerContext.challengeDetail && <blockquote>“{plan.learnerContext.challengeDetail}”</blockquote>}{plan.learnerContext.context && <p><b>Extra context:</b> {plan.learnerContext.context}</p>}<p>{plan.learnerContext.practiceSuggestion}</p></div>}<div className="plan-content"><div className="plan-column"><div className="section-kicker-row"><div><span className="eyebrow"><span className="eyebrow-line" /> Your recommended sequence</span><h2>Five useful next steps.</h2></div><button className="button button-quiet" onClick={() => navigate('/personalize')}><RotateCcw size={15} /> Revise answers</button></div><div className="plan-timeline">{plan.modules.map((module, index) => <PlanModule key={module.id} module={module} index={index} complete={completed.includes(module.lessonId)} navigate={navigate} />)}</div></div><aside className="plan-aside"><div className="start-card"><span className="start-icon"><Play size={18} fill="currentColor" /></span><span className="overview-label">Start here</span><h3>{plan.modules[0]?.title}</h3><p>{plan.modules[0]?.practice}</p><button className="button button-dark full" onClick={() => navigate(`/lesson/${plan.modules[0]?.lessonId}`)}>Open first lesson <ArrowRight size={16} /></button></div><div className="assumptions-card"><div className="assumptions-title"><Lightbulb size={17} /> How this path was made</div>{plan.assumptions.map((assumption) => <p key={assumption}>{assumption}</p>)}</div></aside></div></div></section>
}
function PlanModule({ module, index, complete, navigate }: { module: LearningPlan['modules'][number]; index: number; complete: boolean; navigate: Navigate }) { return <article className={complete ? 'plan-module complete' : 'plan-module'}><div className="module-index">{complete ? <Check size={17} /> : `0${index + 1}`}</div><div className="module-body"><div className="module-meta"><span>{module.eyebrow}</span><span><Clock3 size={13} /> {module.estimatedMinutes} min</span></div><h3>{module.title}</h3><p>{module.description}</p><div className="module-reason"><Sparkles size={14} /><span>{module.reason}</span></div><div className="module-bottom"><span>Practice: {module.practice}</span><button className="text-link text-link-dark" onClick={() => navigate(`/lesson/${module.lessonId}`)}>{complete ? 'Review lesson' : 'Open lesson'} <ArrowRight size={15} /></button></div></div></article> }
function EmptyPlan({ navigate }: { navigate: Navigate }) { return <section className="empty-page"><div className="empty-icon"><Map size={28} /></div><h1>Your path is waiting.</h1><p>Answer a few questions and Bloom It will shape a useful English learning plan around you.</p><button className="button button-primary" onClick={() => navigate('/personalize')}>Build my path <ArrowRight size={16} /></button></section> }

function CoursePage({ navigate }: { navigate: Navigate }) { return <section className="course-page"><div className="container"><div className="course-page-hero"><div><div className="eyebrow"><span className="eyebrow-line" /> English speaking & communication</div><h1>Build a voice<br /><em>that feels like yours.</em></h1><p>A practical, flexible course for speaking with more confidence in everyday moments, work and the opportunities ahead.</p><button className="button button-primary" onClick={() => navigate('/personalize')}>Create my English path <ArrowUpRight size={17} /></button></div><div className="course-stat-card"><span className="course-stat-mark"><Leaf size={22} /></span><b>One course,</b><span>different emphasis for every learner.</span><div className="stat-lines"><span /><span /><span /><span /></div></div></div><div className="catalog-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> The catalogue</span><h2>Start with what<br /><em>matters now.</em></h2></div><p>These modules are the building blocks Bloom It uses to create a path. Your intake decides the order and emphasis — you do not need to complete them all.</p></div><div className="catalog-grid">{modules.map((module, index) => <article className="catalog-card" key={module.id}><div className="catalog-card-top"><span>0{index + 1}</span><span>{module.estimatedMinutes} min</span></div><span className="catalog-eyebrow">{module.eyebrow}</span><h3>{module.title}</h3><p>{module.description}</p><div className="catalog-objective"><Check size={14} /> {module.objectives[0]}</div><button className="text-link text-link-dark" onClick={() => navigate(`/lesson/${module.lessonId}`)}>Preview lesson <ArrowRight size={15} /></button></article>)}</div><div className="course-bottom-cta"><span>Not sure where to start?</span><button className="button button-dark" onClick={() => navigate('/personalize')}>Let Bloom It shape the path <ArrowRight size={16} /></button></div></div></section> }

function LessonPage({ lessonId, navigate, remoteRef }: { lessonId: string; navigate: Navigate; remoteRef: RemotePlanRef | null }) {
  const lesson = lessons.find((item) => item.id === lessonId)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [completed, setCompleted] = useState(() => readStorage<string[]>(COMPLETED_KEY, []).includes(lessonId))
  if (!lesson) return <NotFound navigate={navigate} />
  const exercise = lesson.exercises[0]
  const correct = selected === exercise.answer
  const submit = () => { if (!selected) return; setSubmitted(true); if (correct) { const previous = readStorage<string[]>(COMPLETED_KEY, []); const next = previous.includes(lesson.id) ? previous : [...previous, lesson.id]; try { window.localStorage.setItem(COMPLETED_KEY, JSON.stringify(next)) } catch { /* local prototype storage can be unavailable */ } if (remoteRef) void markRemoteLessonComplete(remoteRef, lesson.id).catch(() => { /* local completion remains available if the network is unavailable */ }); setCompleted(true) } }
  const nextLesson = lessons[(lessons.findIndex((item) => item.id === lesson.id) + 1) % lessons.length]
  return <section className="lesson-page"><div className="container lesson-layout"><div className="lesson-main"><button className="back-link" onClick={() => navigate('/course')}><ChevronLeft size={16} /> Back to course</button><div className="lesson-heading"><span className="lesson-label">{lesson.label} · {lesson.duration}</span><h1>{lesson.title}</h1><p>{lesson.objectives.join(' · ')}</p></div><div className="lesson-block explanation-block"><span className="block-label">The idea</span><p>{lesson.explanation}</p><div className="example-list">{lesson.examples.map((example) => <div key={example}><span>↳</span><span>{example}</span></div>)}</div></div><div className="lesson-block exercise-block"><div className="exercise-block-top"><div><span className="block-label">Try it</span><h2>Choose the best response.</h2></div><span className="exercise-counter">1 question</span></div><p className="lesson-prompt">{exercise.prompt}</p><div className="lesson-options">{exercise.options.map((option, index) => <button key={option} className={selected === option ? `lesson-option ${submitted ? option === exercise.answer ? 'correct' : 'incorrect' : ''}` : 'lesson-option'} onClick={() => { setSelected(option); setSubmitted(false) }}><span className="option-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span>{submitted && selected === option && (option === exercise.answer ? <CheckCircle2 size={17} /> : <X size={17} />)}</button>)}</div>{submitted && <div className={correct ? 'lesson-feedback good' : 'lesson-feedback'}><strong>{correct ? 'Nice work — that is the useful move.' : 'Not quite. Here is the useful idea.'}</strong><p>{exercise.explanation}</p></div>}<div className="exercise-actions">{!completed ? <button className="button button-primary" disabled={!selected} onClick={submit}>{submitted && !correct ? 'Check again' : 'Check answer'} <ArrowRight size={16} /></button> : <span className="lesson-complete"><CheckCircle2 size={17} /> Lesson complete</span>}</div></div></div><aside className="lesson-aside"><div className="lesson-aside-card"><span className="block-label">In this lesson</span><h3>By the end, you can…</h3><ul>{lesson.objectives.map((objective) => <li key={objective}><Check size={15} />{objective}</li>)}</ul><div className="lesson-time"><Clock3 size={15} /> Estimated time: {lesson.duration}</div></div><div className="lesson-aside-card quiet"><span className="block-label">Keep going</span><h3>{completed ? 'Ready for the next moment?' : 'Small practice counts.'}</h3><p>{completed ? 'Keep building the path one useful situation at a time.' : 'You can return to this lesson anytime. Your completion is saved in this browser.'}</p>{completed && <button className="text-link text-link-dark" onClick={() => navigate(`/lesson/${nextLesson.id}`)}>Next lesson <ArrowRight size={15} /></button>}</div></aside></div></section>
}

function LegalPage({ type, navigate }: { type: 'privacy' | 'terms'; navigate: Navigate }) { const privacy = type === 'privacy'; return <section className="legal-page"><div className="container legal-container"><button className="back-link" onClick={() => navigate('/')}><ChevronLeft size={16} /> Back home</button><div className="eyebrow"><span className="eyebrow-line" /> Bloom It / {privacy ? 'Privacy' : 'Terms'}</div><h1>{privacy ? <>A clear note about<br /><em>your information.</em></> : <>A simple agreement<br /><em>for using Bloom It.</em></>}</h1><p className="legal-updated">Prototype policy · Last updated October 2025</p><div className="legal-body">{privacy ? <><h2>What this version stores</h2><p>When you complete the Bloom It intake, the answers you choose, the free-text context you add and the generated learning plan are saved in your browser’s local storage. Lesson completion is stored there too, so you can return to the same path on the same device.</p><h2>Why we use it</h2><p>The information is used only to create and display your personalised learning plan in this prototype. The plan is generated locally by a deterministic matching engine. No external AI provider or analytics service is called by the application.</p><h2>What local storage means</h2><p>This is not a cloud account, a secure backup or cross-device sync. Clearing browser storage, using private browsing or changing devices may remove access to your plan. Do not enter sensitive information, passwords or anything you would not want stored in this browser.</p><h2>Your choices</h2><p>Required consent is separate from optional marketing consent. You can decline marketing and still create a plan. You can clear this prototype’s data through your browser settings. A production version should add a real data store, account controls, retention rules and a way to request deletion before collecting personal data at scale.</p><h2>Questions</h2><p>This is product documentation for the deployable MVP, not legal advice. Before a public launch with real learner accounts, have a qualified privacy professional review the policy for the countries you serve.</p></> : <><h2>Use the product honestly</h2><p>Bloom It is an early learning prototype. You may use its lessons and generated recommendations for personal learning, but you should not treat the self-reported level or generated path as a formal assessment or guarantee of an outcome.</p><h2>What Bloom It provides</h2><p>The active catalogue is English Speaking & Communication. Recommendations are based on a structured rules engine and the information you provide. Future courses and AI-assisted features are not available unless clearly introduced in the product.</p><h2>Your responsibility</h2><p>Use the service lawfully and do not submit another person’s personal information without permission. Because this version uses browser storage, you are responsible for the device and browser where your information is saved.</p><h2>Prototype limitations</h2><p>This MVP does not include accounts, cloud backup, payments, instructor support, formal certification or a guarantee of fluency, employment or any other result. Features may change as Bloom It is developed.</p><h2>Contact and updates</h2><p>There is no public support inbox configured in this prototype. A production deployment should add an accountable operator, support contact and versioned legal terms before inviting broad public use.</p></>}</div></div></section> }
function NotFound({ navigate }: { navigate: Navigate }) { return <section className="empty-page"><div className="empty-icon"><Compass size={28} /></div><h1>That path wandered off.</h1><p>The page you are looking for is not part of this Bloom It path yet.</p><button className="button button-primary" onClick={() => navigate('/')}>Return home <ArrowRight size={16} /></button></section> }

export default App
