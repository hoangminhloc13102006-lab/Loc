import React, { useState, useMemo } from 'react';
import { Salad, LogOut, User } from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import HealthAndMenuPanel from './components/HealthAndMenuPanel';
import ChatAssistantPanel from './components/ChatAssistantPanel';
import { SAMPLE_ACCOUNT, DISEASES } from './data/diseases';
import {
  calculatePatientMetrics,
  checkProfileSpecialCondition,
  generateDailyMealPlan,
  swapDishInMealPlan,
  generateAgentResponse,
} from './lib/nutritionEngine';
import { uid } from './lib/text';

const DEFAULT_PROFILE = {
  age: 48,
  gender: 'male',
  height: 166,
  weight: 68,
  activityLevel: 'light',
  allergies: '',
  diseases: ['D01'],
  specialConditions: [],
};

function createWelcomeMessage(userName, profile, isSaved) {
  const diseaseNames =
    (profile?.diseases || [])
      .map((id) => DISEASES.find((d) => d.id === id)?.shortName)
      .filter(Boolean)
      .join(', ') || 'Chăm sóc sức khỏe';

  return {
    id: uid('msg'),
    sender: 'assistant',
    text:
      `Xin chào **${userName}**! Mình là **Trợ lý Dinh dưỡng AI** của bạn.\n\n` +
      (isSaved
        ? `Mình đã nắm rõ hồ sơ sức khỏe của bạn (**${diseaseNames}**, cao **${profile.height}cm**, nặng **${profile.weight}kg**) và lập sẵn bảng khẩu phần & thực đơn gợi ý ở bên trái.\n\n`
        : `Bạn hãy điền thông tin sức khỏe ở khung bên trái và bấm **"Lưu hồ sơ & Nhờ AI tính khẩu phần"**, hoặc hỏi mình bất kỳ câu hỏi nào ở đây nhé!\n\n`) +
      `Bạn có thể bấm các nút gợi ý bên dưới hoặc hỏi trực tiếp *(ví dụ: "Hôm nay tôi ăn phở bò được không?", "Tính cho tôi thực đơn 1500 kcal")*.`,
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [isProfileSaved, setIsProfileSaved] = useState(false);
  const [customTargetKcal, setCustomTargetKcal] = useState(null);
  const [mealPlan, setMealPlan] = useState(null);
  const [swapCounter, setSwapCounter] = useState(0);
  const [lastSwappedKey, setLastSwappedKey] = useState(null);
  const [messages, setMessages] = useState([]);

  const metrics = useMemo(
    () => calculatePatientMetrics(profile, customTargetKcal),
    [profile, customTargetKcal]
  );

  const specialBlock = useMemo(
    () => checkProfileSpecialCondition(profile),
    [profile]
  );

  // Đăng nhập / Đăng ký thông thường
  const handleLoginSuccess = ({ fullName, email }) => {
    const initialProfile = { ...DEFAULT_PROFILE };
    setUser({ fullName, email });
    setProfile(initialProfile);
    setIsProfileSaved(false);
    setCustomTargetKcal(null);
    setMealPlan(null);
    setMessages([createWelcomeMessage(fullName, initialProfile, false)]);
  };

  // Dùng thử nhanh (Tài khoản mẫu) - 1 cú nhấp chuột vào thẳng trang chính kèm dữ liệu mẫu
  const handleQuickDemo = (sampleAccount = SAMPLE_ACCOUNT) => {
    const demoProfile = {
      ...sampleAccount.profile,
      diseases: [...sampleAccount.profile.diseases],
      specialConditions: [...(sampleAccount.profile.specialConditions || [])],
    };
    const initialPlan = generateDailyMealPlan(demoProfile, null, 0);

    setUser({
      fullName: sampleAccount.fullName,
      email: sampleAccount.email,
    });
    setProfile(demoProfile);
    setIsProfileSaved(true);
    setCustomTargetKcal(null);
    setMealPlan(initialPlan);
    setMessages([createWelcomeMessage(sampleAccount.fullName, demoProfile, true)]);
  };

  // Đăng xuất
  const handleLogout = () => {
    setUser(null);
    setIsProfileSaved(false);
    setCustomTargetKcal(null);
    setMealPlan(null);
    setMessages([]);
  };

  // Lưu hồ sơ & Nhờ AI tính khẩu phần
  const handleSaveProfile = () => {
    setIsProfileSaved(true);
    setCustomTargetKcal(null);

    const safety = checkProfileSpecialCondition(profile);
    if (safety) {
      setMealPlan(null);
      setMessages((prev) => [
        ...prev,
        {
          id: uid('msg'),
          sender: 'assistant',
          text: safety.message,
        },
      ]);
      return;
    }

    const nextSeed = swapCounter + 1;
    setSwapCounter(nextSeed);
    const newPlan = generateDailyMealPlan(profile, null, nextSeed);
    const newMetrics = calculatePatientMetrics(profile, null);
    setMealPlan(newPlan);

    const diseaseNames =
      (profile.diseases || [])
        .map((id) => DISEASES.find((d) => d.id === id)?.shortName)
        .filter(Boolean)
        .join(', ') || 'Chăm sóc sức khỏe chuẩn';

    setMessages((prev) => [
      ...prev,
      {
        id: uid('msg'),
        sender: 'assistant',
        text:
          `✅ **Đã lưu hồ sơ & cập nhật Thực đơn 1 ngày cho bạn!**\n\n` +
          `• **Hồ sơ bệnh lý:** ${diseaseNames}\n` +
          `• **Chỉ số BMI:** **${newMetrics.bmi}** (${newMetrics.bmiLabel}) — Năng lượng cần thiết: **${newMetrics.targetKcal} Kcal/ngày**${newMetrics.isObeseOrOverweight ? ' *(đã trừ 400 Kcal hỗ trợ giảm cân)*' : ''}.\n` +
          `• **Khẩu phần chuẩn:** Đạm **${newMetrics.macros.protein}g** – Đường bột **${newMetrics.macros.carbs}g** – Chất béo **${newMetrics.macros.fat}g**/ngày.\n` +
          `• **Lưu ý quan trọng:** ${newMetrics.rules.primaryCaution}\n\n` +
          `Bạn có thể xem chi tiết từng bữa ăn ở bảng bên trái, bấm **"Đổi món khác"** cạnh món bất kỳ hoặc hỏi mình thêm ở đây nhé!`,
      },
    ]);
  };

  // Đổi món trực tiếp từ nút "Đổi món khác" ở bảng Thực đơn bên trái
  const handleSwapDish = (mealId, itemIndex) => {
    if (!mealPlan) return;
    const swapped = swapDishInMealPlan(mealPlan, mealId, itemIndex, profile);
    if (!swapped) return;

    setMealPlan(swapped.plan);
    setSwapCounter((c) => c + 1);
    const key = `${mealId}_${itemIndex}`;
    setLastSwappedKey(key);
    setTimeout(() => {
      setLastSwappedKey((prevKey) => (prevKey === key ? null : prevKey));
    }, 1200);
  };

  // Gửi tin nhắn hoặc bấm Quick Action trong khung Trợ lý Dinh dưỡng AI bên phải
  const handleSendMessage = (text) => {
    const userMsg = {
      id: uid('msg_u'),
      sender: 'user',
      text,
    };

    const nextSeed = swapCounter + 1;
    setSwapCounter(nextSeed);

    const response = generateAgentResponse({
      userText: text,
      profile,
      currentMealPlan: mealPlan,
      swapCounter: nextSeed,
    });

    if (response.updatedCustomKcal) {
      setCustomTargetKcal(response.updatedCustomKcal);
    }

    if (response.updatedMealPlan) {
      setMealPlan(response.updatedMealPlan);
      setIsProfileSaved(true);
    }

    const botMsg = {
      id: uid('msg_a'),
      sender: 'assistant',
      text: response.replyText,
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
  };

  // Màn hình Đăng ký / Đăng nhập hiển thị đầu tiên
  if (!user) {
    return (
      <AuthScreen
        onLoginSuccess={handleLoginSuccess}
        onQuickDemo={handleQuickDemo}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Thanh Header trên cùng chỉ hiển thị: Tên ứng dụng "AI Nutrition", Tên người dùng và nút "Đăng xuất" */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200/90">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
              <Salad className="w-4 h-4" />
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight">
              AI Nutrition
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl">
              <User className="w-4 h-4 text-emerald-600" />
              <span>{user.fullName}</span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      {/* Khu vực nội dung chính: Trái (60-65% Khai báo Sức khỏe & Thực đơn) - Phải (35-40% Khung AI Agent) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Khu vực Chính bên trái (63%) */}
          <div className="w-full lg:w-[63%]">
            <HealthAndMenuPanel
              profile={profile}
              onChangeProfile={setProfile}
              onSaveProfile={handleSaveProfile}
              isProfileSaved={isProfileSaved}
              metrics={metrics}
              mealPlan={mealPlan}
              specialBlock={specialBlock}
              onSwapDish={handleSwapDish}
              lastSwappedKey={lastSwappedKey}
            />
          </div>

          {/* Khung AI Agent cố định ở Góc Bên Phải (37%) */}
          <div className="w-full lg:w-[37%]">
            <ChatAssistantPanel
              profile={profile}
              messages={messages}
              onSendMessage={handleSendMessage}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

