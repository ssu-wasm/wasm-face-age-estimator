#include "sign_recognition.h"
#include <cmath>
#include <algorithm>
#include <sstream>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

SignRecognizer::SignRecognizer() 
    : detectionThreshold(0.5f), recognitionThreshold(0.7f) {
}

SignRecognizer::~SignRecognizer() {
}

bool SignRecognizer::initialize() {
    return true;
}

bool SignRecognizer::isFingerExtended(const HandLandmark& tip, const HandLandmark& pip, const HandLandmark& mcp) const {
    // 손가락이 펴져있으면 tip.y < pip.y < mcp.y
    return tip.y < pip.y && pip.y < mcp.y;
}

bool SignRecognizer::isThumbExtended(const HandLandmark& thumbTip, const HandLandmark& thumbIp, const HandLandmark& wrist) const {
    // 엄지는 x 좌표로 판단 (손바닥이 보일 때)
    float thumbDistance = std::abs(thumbTip.x - wrist.x);
    float ipDistance = std::abs(thumbIp.x - wrist.x);
    return thumbDistance > ipDistance;
}

float SignRecognizer::calculateDistance(const HandLandmark& a, const HandLandmark& b) const {
    float dx = a.x - b.x;
    float dy = a.y - b.y;
    float dz = a.z - b.z;
    return std::sqrt(dx * dx + dy * dy + dz * dz);
}

float SignRecognizer::calculateAngle(const HandLandmark& a, const HandLandmark& b, const HandLandmark& c) const {
    // 벡터 BA와 BC 사이의 각도 계산
    float baX = a.x - b.x;
    float baY = a.y - b.y;
    float bcX = c.x - b.x;
    float bcY = c.y - b.y;
    
    float dot = baX * bcX + baY * bcY;
    float magBA = std::sqrt(baX * baX + baY * baY);
    float magBC = std::sqrt(bcX * bcX + bcY * bcY);
    
    if (magBA == 0.0f || magBC == 0.0f) return 0.0f;
    
    float cosAngle = dot / (magBA * magBC);
    cosAngle = std::max(-1.0f, std::min(1.0f, cosAngle)); // Clamp to [-1, 1]
    
    return std::acos(cosAngle) * 180.0f / M_PI; // Convert to degrees
}

std::vector<float> SignRecognizer::normalizeLandmarks(const std::vector<HandLandmark>& landmarks) {
    if (landmarks.size() != 21) {
        return {};
    }
    
    const HandLandmark& wrist = landmarks[0];
    std::vector<float> normalized;
    normalized.reserve(42); // 21 landmarks * 2 (x, y)
    
    for (const auto& landmark : landmarks) {
        normalized.push_back(landmark.x - wrist.x);
        normalized.push_back(landmark.y - wrist.y);
    }
    
    return normalized;
}

RecognitionResult SignRecognizer::recognizeByRules(const std::vector<HandLandmark>& landmarks) {
    if (landmarks.size() != 21) {
        return {"감지되지 않음", 0.0f, 0};
    }
    
    // 손가락 끝 랜드마크 인덱스
    const HandLandmark& thumbTip = landmarks[4];
    const HandLandmark& indexTip = landmarks[8];
    const HandLandmark& middleTip = landmarks[12];
    const HandLandmark& ringTip = landmarks[16];
    const HandLandmark& pinkyTip = landmarks[20];
    const HandLandmark& wrist = landmarks[0];
    
    // 각 손가락이 펴져있는지 확인
    bool indexExtended = isFingerExtended(indexTip, landmarks[6], landmarks[5]);
    bool middleExtended = isFingerExtended(middleTip, landmarks[10], landmarks[9]);
    bool ringExtended = isFingerExtended(ringTip, landmarks[14], landmarks[13]);
    bool pinkyExtended = isFingerExtended(pinkyTip, landmarks[18], landmarks[17]);
    bool thumbExtended = isThumbExtended(thumbTip, landmarks[3], wrist);
    
    int extendedFingers = 0;
    if (thumbExtended) extendedFingers++;
    if (indexExtended) extendedFingers++;
    if (middleExtended) extendedFingers++;
    if (ringExtended) extendedFingers++;
    if (pinkyExtended) extendedFingers++;
    
    // 규칙 기반 인식
    if (extendedFingers == 1 && indexExtended) {
        // 검지만 펴져있음 -> "예"
        return {"예", 0.85f, 3};
    } else if (extendedFingers == 5) {
        // 모든 손가락이 펴져있음 -> "안녕하세요"
        return {"안녕하세요", 0.80f, 1};
    } else if (extendedFingers == 0) {
        // 주먹 -> "감사합니다"
        return {"감사합니다", 0.75f, 2};
    } else if (extendedFingers == 2 && indexExtended && middleExtended) {
        // 검지와 중지만 펴져있음 -> "V" (추가 제스처)
        return {"V", 0.70f, 4};
    } else if (extendedFingers == 3 && indexExtended && middleExtended && ringExtended) {
        // 검지, 중지, 약지만 펴져있음 -> "OK" (추가 제스처)
        return {"OK", 0.70f, 5};
    }
    
    return {"감지되지 않음", 0.0f, 0};
}

RecognitionResult SignRecognizer::recognize(const std::vector<HandLandmark>& landmarks) {
    if (landmarks.size() != 21) {
        return {"감지되지 않음", 0.0f, 0};
    }
    
    // 규칙 기반 인식 시도
    RecognitionResult result = recognizeByRules(landmarks);
    
    // 신뢰도가 임계값 이상이면 반환
    if (result.confidence >= recognitionThreshold) {
        return result;
    }
    
    // 추가적인 패턴 매칭 로직을 여기에 추가할 수 있음
    // 예: 거리 기반, 각도 기반 인식 등
    
    return {"감지되지 않음", 0.0f, 0};
}

std::string SignRecognizer::recognizeFromPointer(float* landmarks, int count) {
    if (count != 42) { // 21 landmarks * 2 (x, y)
        return "{\"gesture\":\"감지되지 않음\",\"confidence\":0.0,\"id\":0}";
    }
    
    // 포인터에서 랜드마크 벡터로 변환
    std::vector<HandLandmark> landmarkVec;
    landmarkVec.reserve(21);
    
    for (int i = 0; i < 21; i++) {
        HandLandmark lm;
        lm.x = landmarks[i * 2];
        lm.y = landmarks[i * 2 + 1];
        lm.z = 0.0f; // z는 사용하지 않음
        landmarkVec.push_back(lm);
    }
    
    RecognitionResult result = recognize(landmarkVec);
    
    // JSON 형식으로 반환
    std::ostringstream json;
    json << "{\"gesture\":\"" << result.gesture 
         << "\",\"confidence\":" << result.confidence 
         << ",\"id\":" << result.id << "}";
    
    return json.str();
}

void SignRecognizer::setDetectionThreshold(float threshold) {
    detectionThreshold = threshold;
}

void SignRecognizer::setRecognitionThreshold(float threshold) {
    recognitionThreshold = threshold;
}

std::string SignRecognizer::getVersion() const {
    return "1.0.0";
}

