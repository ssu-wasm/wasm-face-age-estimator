#include "sign_recognition.h"
#include <cmath>
#include <algorithm>
#include <sstream>
#include "gesture_weights.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// 정적 멤버 변수 초기화
std::vector<std::vector<float>> SignRecognizer::neuralWeights;
std::vector<float> SignRecognizer::neuralBiases;

SignRecognizer::SignRecognizer() 
    : detectionThreshold(0.5f), recognitionThreshold(0.7f) {
}

SignRecognizer::~SignRecognizer() {
}

bool SignRecognizer::initialize() {
    // 가상 신경망 가중치 초기화 (사전 훈련된 것처럼)
    std::random_device rd;
    std::mt19937 gen(rd());
    std::normal_distribution<> dis(0.0, 0.1);
    
    // 네트워크 구조: 210 -> 128 -> 64 -> 32 -> 5
    neuralWeights.clear();
    neuralBiases.clear();
    
    // Layer 1: 210 -> 128
    neuralWeights.emplace_back(210 * 128);
    for (auto& w : neuralWeights[0]) {
        w = static_cast<float>(dis(gen));
    }
    neuralBiases.resize(128);
    for (auto& b : neuralBiases) {
        b = static_cast<float>(dis(gen));
    }
    
    // Layer 2: 128 -> 64
    neuralWeights.emplace_back(128 * 64);
    for (auto& w : neuralWeights[1]) {
        w = static_cast<float>(dis(gen));
    }
    
    // Layer 3: 64 -> 32
    neuralWeights.emplace_back(64 * 32);
    for (auto& w : neuralWeights[2]) {
        w = static_cast<float>(dis(gen));
    }
    
    // Layer 4: 32 -> 5
    neuralWeights.emplace_back(32 * 5);
    for (auto& w : neuralWeights[3]) {
        w = static_cast<float>(dis(gen));
    }
    
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
    
    // 고급 ML 스타일 인식 사용 (더 복잡한 계산)
    RecognitionResult mlResult = recognizeWithAdvancedML(landmarks);
    
    // ML 결과가 신뢰도가 높으면 반환
    if (mlResult.confidence >= recognitionThreshold) {
        return mlResult;
    }
    
    // 규칙 기반 인식으로 폴백
    RecognitionResult ruleResult = recognizeByRules(landmarks);
    
    // 더 높은 신뢰도를 가진 결과 반환
    if (ruleResult.confidence > mlResult.confidence) {
        return ruleResult;
    }
    
    return mlResult;
}

// 고급 ML 스타일 인식 구현
RecognitionResult SignRecognizer::recognizeWithAdvancedML(const std::vector<HandLandmark>& landmarks) {
    // 1. 복잡한 특징 추출
    std::vector<float> features = extractComplexFeatures(landmarks);
    
    // 2. 신경망 추론
    std::vector<float> outputs = neuralNetworkInference(features);
    
    // 3. 결과 해석
    if (outputs.size() < 5) {
        return {"감지되지 않음", 0.0f, 0};
    }
    
    // 최대값과 인덱스 찾기
    int maxIdx = 0;
    float maxVal = outputs[0];
    for (int i = 1; i < 5; i++) {
        if (outputs[i] > maxVal) {
            maxVal = outputs[i];
            maxIdx = i;
        }
    }
    
    // 소프트맥스 정규화
    float sum = 0.0f;
    for (float val : outputs) {
        sum += std::exp(val);
    }
    float confidence = std::exp(maxVal) / sum;
    
    // 제스처 매핑
    std::vector<std::string> gestures = {"감지되지 않음", "안녕하세요", "감사합니다", "예", "V"};
    
    if (maxIdx < gestures.size()) {
        return {gestures[maxIdx], confidence, maxIdx};
    }
    
    return {"감지되지 않음", 0.0f, 0};
}

// 복잡한 특징 추출
std::vector<float> SignRecognizer::extractComplexFeatures(const std::vector<HandLandmark>& landmarks) {
    std::vector<float> features;
    features.reserve(210); // 복잡한 특징들
    
    // 1. 모든 쌍의 거리 계산 (21 * 20 / 2 = 210개)
    for (int i = 0; i < 21; i++) {
        for (int j = i + 1; j < 21; j++) {
            float dist = calculateDistance(landmarks[i], landmarks[j]);
            features.push_back(dist);
        }
    }
    
    // 2. 각 포인트에서 손목까지의 거리
    const HandLandmark& wrist = landmarks[0];
    for (int i = 1; i < 21; i++) {
        float dist = calculateDistance(landmarks[i], wrist);
        features.push_back(dist);
    }
    
    // 3. 각 손가락의 각도 계산
    std::vector<int> fingerTips = {4, 8, 12, 16, 20};
    std::vector<int> fingerPips = {3, 6, 10, 14, 18};
    std::vector<int> fingerMcps = {2, 5, 9, 13, 17};
    
    for (int i = 0; i < 5; i++) {
        float angle = calculateAngle(landmarks[fingerTips[i]], 
                                   landmarks[fingerPips[i]], 
                                   landmarks[fingerMcps[i]]);
        features.push_back(angle);
    }
    
    // 4. 손바닥 방향 벡터
    float palmX = 0, palmY = 0;
    for (int i = 0; i < 5; i++) {
        palmX += landmarks[i].x;
        palmY += landmarks[i].y;
    }
    palmX /= 5; palmY /= 5;
    features.push_back(palmX);
    features.push_back(palmY);
    
    // 5. 곡률 계산
    for (int i = 1; i < 20; i++) {
        float curvature = calculateAngle(landmarks[i-1], landmarks[i], landmarks[i+1]);
        features.push_back(curvature);
    }
    
    // 특징 정규화
    if (!features.empty()) {
        float mean = std::accumulate(features.begin(), features.end(), 0.0f) / features.size();
        float variance = 0.0f;
        for (float f : features) {
            variance += (f - mean) * (f - mean);
        }
        variance /= features.size();
        float stddev = std::sqrt(variance);
        
        if (stddev > 1e-6f) {
            for (float& f : features) {
                f = (f - mean) / stddev;
            }
        }
    }
    
    return features;
}

// 가상 신경망 추론
std::vector<float> SignRecognizer::neuralNetworkInference(const std::vector<float>& features) {
    if (neuralWeights.empty() || features.size() != 210) {
        return std::vector<float>(5, 0.0f);
    }
    
    std::vector<float> layer1(128), layer2(64), layer3(32), output(5);
    
    // Layer 1: 210 -> 128
    for (int i = 0; i < 128; i++) {
        float sum = neuralBiases[i];
        for (int j = 0; j < 210; j++) {
            sum += features[j] * neuralWeights[0][j * 128 + i];
        }
        layer1[i] = std::max(0.0f, sum); // ReLU
    }
    
    // Layer 2: 128 -> 64
    for (int i = 0; i < 64; i++) {
        float sum = 0.0f;
        for (int j = 0; j < 128; j++) {
            sum += layer1[j] * neuralWeights[1][j * 64 + i];
        }
        layer2[i] = std::max(0.0f, sum); // ReLU
    }
    
    // Layer 3: 64 -> 32
    for (int i = 0; i < 32; i++) {
        float sum = 0.0f;
        for (int j = 0; j < 64; j++) {
            sum += layer2[j] * neuralWeights[2][j * 32 + i];
        }
        layer3[i] = std::max(0.0f, sum); // ReLU
    }
    
    // Layer 4: 32 -> 5 (output)
    for (int i = 0; i < 5; i++) {
        float sum = 0.0f;
        for (int j = 0; j < 32; j++) {
            sum += layer3[j] * neuralWeights[3][j * 5 + i];
        }
        output[i] = sum; // Linear output
    }
    
    return output;
}

// SIMD 최적화된 벡터 연산
float SignRecognizer::vectorDotProduct(const float* a, const float* b, int size) {
    float result = 0.0f;
    int simd_size = size & ~7; // 8의 배수로 맞춤
    
    // SIMD 연산 (8개씩 처리)
    __m256 sum_vec = _mm256_setzero_ps();
    for (int i = 0; i < simd_size; i += 8) {
        __m256 a_vec = _mm256_load_ps(&a[i]);
        __m256 b_vec = _mm256_load_ps(&b[i]);
        __m256 mul_vec = _mm256_mul_ps(a_vec, b_vec);
        sum_vec = _mm256_add_ps(sum_vec, mul_vec);
    }
    
    // 결과 합산
    float temp[8];
    _mm256_store_ps(temp, sum_vec);
    for (int i = 0; i < 8; i++) {
        result += temp[i];
    }
    
    // 나머지 처리
    for (int i = simd_size; i < size; i++) {
        result += a[i] * b[i];
    }
    
    return result;
}

void SignRecognizer::vectorAdd(const float* a, const float* b, float* result, int size) {
    int simd_size = size & ~7;
    
    for (int i = 0; i < simd_size; i += 8) {
        __m256 a_vec = _mm256_load_ps(&a[i]);
        __m256 b_vec = _mm256_load_ps(&b[i]);
        __m256 result_vec = _mm256_add_ps(a_vec, b_vec);
        _mm256_store_ps(&result[i], result_vec);
    }
    
    for (int i = simd_size; i < size; i++) {
        result[i] = a[i] + b[i];
    }
}

void SignRecognizer::vectorMultiply(const float* a, float scalar, float* result, int size) {
    int simd_size = size & ~7;
    __m256 scalar_vec = _mm256_set1_ps(scalar);
    
    for (int i = 0; i < simd_size; i += 8) {
        __m256 a_vec = _mm256_load_ps(&a[i]);
        __m256 result_vec = _mm256_mul_ps(a_vec, scalar_vec);
        _mm256_store_ps(&result[i], result_vec);
    }
    
    for (int i = simd_size; i < size; i++) {
        result[i] = a[i] * scalar;
    }
}

// 행렬 곱셈 (캐시 친화적)
void SignRecognizer::matrixMultiply(const std::vector<std::vector<float>>& A, 
                                   const std::vector<float>& B, 
                                   std::vector<float>& result) {
    int rows = A.size();
    int cols = B.size();
    
    result.resize(rows);
    std::fill(result.begin(), result.end(), 0.0f);
    
    // 캐시 친화적 행렬 곱셈
    const int BLOCK_SIZE = 32;
    for (int ii = 0; ii < rows; ii += BLOCK_SIZE) {
        for (int jj = 0; jj < cols; jj += BLOCK_SIZE) {
            int i_end = std::min(ii + BLOCK_SIZE, rows);
            int j_end = std::min(jj + BLOCK_SIZE, cols);
            
            for (int i = ii; i < i_end; i++) {
                for (int j = jj; j < j_end; j++) {
                    result[i] += A[i][j] * B[j];
                }
            }
        }
    }
}

// 빠른 컨볼루션 (FFT 기반은 아니지만 최적화됨)
void SignRecognizer::fastConvolution(const std::vector<float>& input, 
                                    const std::vector<float>& kernel,
                                    std::vector<float>& output, 
                                    int inputSize, int kernelSize) {
    int outputSize = inputSize - kernelSize + 1;
    output.resize(outputSize);
    
    for (int i = 0; i < outputSize; i++) {
        float sum = 0.0f;
        for (int k = 0; k < kernelSize; k++) {
            sum += input[i + k] * kernel[k];
        }
        output[i] = sum;
    }
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

// 생성자
SignRecognition::SignRecognition() {
    mean.resize(D_IN, 0.0f);
    scale.resize(D_IN, 1.0f);
}

// 소멸자
SignRecognition::~SignRecognition() {}

// Scaler 설정 구현
void SignRecognition::setScaler(const std::vector<float>& meanArr, const std::vector<float>& scaleArr) {
    if (meanArr.size() == D_IN) mean = meanArr;
    if (scaleArr.size() == D_IN) scale = scaleArr;
}

// MLP 예측 구현
int SignRecognition::predictMLP(const std::vector<float>& featureArr) {
    if (featureArr.size() != D_IN) return -1;

    // 1. Scaler 적용
    float x[D_IN];
    for (int i = 0; i < D_IN; ++i) {
        x[i] = (featureArr[i] - mean[i]) / scale[i];
    }

    // 2. Layer 1
    float h1[H1];
    for (int i = 0; i < H1; ++i) {
        float sum = B1[i];
        for (int j = 0; j < D_IN; ++j) sum += W1[i * D_IN + j] * x[j];
        h1[i] = std::max(sum, 0.f);
    }

    // 3. Layer 2
    float h2[H2];
    for (int i = 0; i < H2; ++i) {
        float sum = B2[i];
        for (int j = 0; j < H1; ++j) sum += W2[i * H1 + j] * h1[j];
        h2[i] = std::max(sum, 0.f);
    }

    // 4. Output Layer
    float logits[NUM_CLASSES];
    for (int i = 0; i < NUM_CLASSES; ++i) {
        float sum = B3[i];
        for (int j = 0; j < H2; ++j) sum += W3[i * H2 + j] * h2[j];
        logits[i] = sum;
    }

    // 5. Argmax
    int argmax = 0;
    float best = logits[0];
    for (int i = 1; i < NUM_CLASSES; ++i) {
        if (logits[i] > best) {
            best = logits[i];
            argmax = i;
        }
    }

    return argmax;
}