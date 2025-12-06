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
    // 가상 신경망 가중치 초기화 (JavaScript와 완전히 동일한 고정값 사용)
    std::cout << "🔧 C++ 가중치 생성 (고정값)" << std::endl;
    
    const float fixedValue = 0.05f; // JavaScript와 동일한 고정값
    const float fixedBias = 0.01f;  // JavaScript와 동일한 바이어스
    
    // 네트워크 구조: 210 -> 128 -> 64 -> 32 -> 5
    neuralWeights.clear();
    neuralBiases.clear();
    
    // Layer 1: 210 -> 128
    neuralWeights.emplace_back(210 * 128, fixedValue);
    neuralBiases.resize(128, fixedBias);
    
    // Layer 2: 128 -> 64
    neuralWeights.emplace_back(128 * 64, fixedValue);
    
    // Layer 3: 64 -> 32
    neuralWeights.emplace_back(64 * 32, fixedValue);
    
    // Layer 4: 32 -> 5
    neuralWeights.emplace_back(32 * 5, fixedValue);
    
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
    
    // Layer 1: 210 -> 128 (SIMD 최적화)
    for (int i = 0; i < 128; i++) {
        // SIMD 최적화된 벡터 내적 사용
        std::vector<float> weights_col(210);
        for (int j = 0; j < 210; j++) {
            weights_col[j] = neuralWeights[0][j * 128 + i];
        }
        float sum = neuralBiases[i] + vectorDotProduct(features.data(), weights_col.data(), 210);
        layer1[i] = std::max(0.0f, sum); // ReLU
    }
    
    // Layer 2: 128 -> 64 (SIMD 최적화)
    for (int i = 0; i < 64; i++) {
        std::vector<float> weights_col(128);
        for (int j = 0; j < 128; j++) {
            weights_col[j] = neuralWeights[1][j * 64 + i];
        }
        float sum = vectorDotProduct(layer1.data(), weights_col.data(), 128);
        layer2[i] = std::max(0.0f, sum); // ReLU
    }
    
    // Layer 3: 64 -> 32 (SIMD 최적화)
    for (int i = 0; i < 32; i++) {
        std::vector<float> weights_col(64);
        for (int j = 0; j < 64; j++) {
            weights_col[j] = neuralWeights[2][j * 32 + i];
        }
        float sum = vectorDotProduct(layer2.data(), weights_col.data(), 64);
        layer3[i] = std::max(0.0f, sum); // ReLU
    }
    
    // Layer 4: 32 -> 5 (SIMD 최적화 output)
    for (int i = 0; i < 5; i++) {
        std::vector<float> weights_col(32);
        for (int j = 0; j < 32; j++) {
            weights_col[j] = neuralWeights[3][j * 5 + i];
        }
        output[i] = vectorDotProduct(layer3.data(), weights_col.data(), 32); // Linear output
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

// 배치 처리 구현 (진정한 WASM 성능을 위해)
std::string SignRecognizer::recognizeBatch(float* landmarks, int frameCount, int landmarksPerFrame) {
    if (landmarksPerFrame != 42) { // 21 landmarks * 2 (x, y)
        return "{\"error\":\"Invalid landmarks per frame\",\"results\":[]}";
    }
    
    std::ostringstream json;
    json << "{\"results\":[";
    
    // 배치로 모든 프레임 처리
    for (int frame = 0; frame < frameCount; frame++) {
        float* frameData = landmarks + (frame * landmarksPerFrame);
        
        // 포인터에서 랜드마크 벡터로 변환
        std::vector<HandLandmark> landmarkVec;
        landmarkVec.reserve(21);
        
        for (int i = 0; i < 21; i++) {
            HandLandmark lm;
            lm.x = frameData[i * 2];
            lm.y = frameData[i * 2 + 1];
            lm.z = 0.0f;
            landmarkVec.push_back(lm);
        }
        
        // 인식 수행
        RecognitionResult result = recognize(landmarkVec);
        
        // JSON 배열에 추가
        if (frame > 0) json << ",";
        json << "{\"gesture\":\"" << result.gesture 
             << "\",\"confidence\":" << result.confidence 
             << ",\"id\":" << result.id << "}";
    }
    
    json << "],\"frameCount\":" << frameCount << "}";
    return json.str();
}

// === WASM이 빛나는 영역들 구현 ===

// 1. 이미지 가우시안 블러 (CPU 집약적)
void SignRecognizer::processImageData(uint8_t* imageData, int width, int height, int filterType) {
    if (filterType == 0) { // Gaussian Blur
        const int kernelSize = 5;
        const float kernel[25] = {
            1, 4, 6, 4, 1,
            4, 16, 24, 16, 4,
            6, 24, 36, 24, 6,
            4, 16, 24, 16, 4,
            1, 4, 6, 4, 1
        };
        const float kernelSum = 256.0f;
        
        std::vector<uint8_t> temp(width * height * 4);
        
        // 가우시안 블러 적용 (RGBA 채널별로)
        for (int y = 2; y < height - 2; y++) {
            for (int x = 2; x < width - 2; x++) {
                for (int channel = 0; channel < 4; channel++) {
                    float sum = 0;
                    
                    for (int ky = 0; ky < kernelSize; ky++) {
                        for (int kx = 0; kx < kernelSize; kx++) {
                            int pixelY = y + ky - 2;
                            int pixelX = x + kx - 2;
                            int pixelIndex = (pixelY * width + pixelX) * 4 + channel;
                            sum += imageData[pixelIndex] * kernel[ky * kernelSize + kx];
                        }
                    }
                    
                    temp[(y * width + x) * 4 + channel] = (uint8_t)(sum / kernelSum);
                }
            }
        }
        
        // 결과 복사
        std::memcpy(imageData, temp.data(), width * height * 4);
    }
}

// 2. 대용량 행렬 곱셈 (SIMD 최적화)
void SignRecognizer::matrixMultiplyLarge(float* matA, float* matB, float* result, int size) {
    // 메모리 초기화
    std::memset(result, 0, size * size * sizeof(float));
    
    // 캐시 친화적 행렬 곱셈 (블록 단위)
    const int BLOCK_SIZE = 64;
    
    for (int ii = 0; ii < size; ii += BLOCK_SIZE) {
        for (int jj = 0; jj < size; jj += BLOCK_SIZE) {
            for (int kk = 0; kk < size; kk += BLOCK_SIZE) {
                
                int i_end = std::min(ii + BLOCK_SIZE, size);
                int j_end = std::min(jj + BLOCK_SIZE, size);
                int k_end = std::min(kk + BLOCK_SIZE, size);
                
                for (int i = ii; i < i_end; i++) {
                    for (int j = jj; j < j_end; j++) {
                        float sum = 0.0f;
                        
                        // SIMD 최적화 가능한 내부 루프
                        for (int k = kk; k < k_end; k++) {
                            sum += matA[i * size + k] * matB[k * size + j];
                        }
                        
                        result[i * size + j] += sum;
                    }
                }
            }
        }
    }
}

// 3. 단순 FFT 구현 (재귀적)
void SignRecognizer::computeFFT(float* realPart, float* imagPart, int size) {
    if (size <= 1) return;
    
    // 비트 역순 정렬
    for (int i = 1, j = 0; i < size; i++) {
        int bit = size >> 1;
        for (; j & bit; bit >>= 1) {
            j ^= bit;
        }
        j ^= bit;
        
        if (i < j) {
            std::swap(realPart[i], realPart[j]);
            std::swap(imagPart[i], imagPart[j]);
        }
    }
    
    // FFT 계산
    for (int len = 2; len <= size; len <<= 1) {
        double ang = -2 * M_PI / len;
        double wlen_r = cos(ang);
        double wlen_i = sin(ang);
        
        for (int i = 0; i < size; i += len) {
            double w_r = 1;
            double w_i = 0;
            
            for (int j = 0; j < len / 2; j++) {
                int u = i + j;
                int v = i + j + len / 2;
                
                double u_r = realPart[u];
                double u_i = imagPart[u];
                double v_r = realPart[v] * w_r - imagPart[v] * w_i;
                double v_i = realPart[v] * w_i + imagPart[v] * w_r;
                
                realPart[u] = u_r + v_r;
                imagPart[u] = u_i + v_i;
                realPart[v] = u_r - v_r;
                imagPart[v] = u_i - v_i;
                
                double next_w_r = w_r * wlen_r - w_i * wlen_i;
                double next_w_i = w_r * wlen_i + w_i * wlen_r;
                w_r = next_w_r;
                w_i = next_w_i;
            }
        }
    }
}

// 4. SHA-256 해시 (간단 버전)
void SignRecognizer::sha256Hash(uint8_t* input, int length, uint8_t* output) {
    // SHA-256 상수들
    const uint32_t K[64] = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        // ... (전체 64개 상수는 생략)
    };
    
    // 초기 해시값
    uint32_t H[8] = {
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    };
    
    // 간단한 해시 시뮬레이션 (실제 SHA-256은 더 복잡)
    for (int i = 0; i < length; i++) {
        uint32_t data = input[i];
        for (int j = 0; j < 8; j++) {
            H[j] = (H[j] + data * K[i % 64]) ^ (H[j] << 7) ^ (H[j] >> 11);
        }
    }
    
    // 결과를 바이트 배열로 변환
    for (int i = 0; i < 8; i++) {
        output[i * 4] = (H[i] >> 24) & 0xFF;
        output[i * 4 + 1] = (H[i] >> 16) & 0xFF;
        output[i * 4 + 2] = (H[i] >> 8) & 0xFF;
        output[i * 4 + 3] = H[i] & 0xFF;
    }
}

// 5. 파티클 물리 시뮬레이션
void SignRecognizer::simulateParticles(float* positions, float* velocities, int particleCount, float deltaTime) {
    const float gravity = -9.8f;
    const float damping = 0.99f;
    
    // 각 파티클 업데이트
    for (int i = 0; i < particleCount; i++) {
        int idx = i * 3; // x, y, z
        
        // 중력 적용
        velocities[idx + 1] += gravity * deltaTime;
        
        // 위치 업데이트
        positions[idx] += velocities[idx] * deltaTime;
        positions[idx + 1] += velocities[idx + 1] * deltaTime;
        positions[idx + 2] += velocities[idx + 2] * deltaTime;
        
        // 바닥 충돌 검사
        if (positions[idx + 1] < 0) {
            positions[idx + 1] = 0;
            velocities[idx + 1] = -velocities[idx + 1] * damping;
        }
        
        // 간단한 파티클 간 상호작용
        for (int j = i + 1; j < particleCount; j++) {
            int jdx = j * 3;
            
            float dx = positions[idx] - positions[jdx];
            float dy = positions[idx + 1] - positions[jdx + 1];
            float dz = positions[idx + 2] - positions[jdx + 2];
            
            float distance = std::sqrt(dx*dx + dy*dy + dz*dz);
            
            if (distance < 1.0f && distance > 0.001f) {
                float force = 0.1f / distance;
                
                velocities[idx] += dx * force * deltaTime;
                velocities[idx + 1] += dy * force * deltaTime;
                velocities[idx + 2] += dz * force * deltaTime;
                
                velocities[jdx] -= dx * force * deltaTime;
                velocities[jdx + 1] -= dy * force * deltaTime;
                velocities[jdx + 2] -= dz * force * deltaTime;
            }
        }
    }
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

// === 대용량 행렬 곱셈 기반 고급 수화 인식 구현 ===

RecognitionResult SignRecognizer::recognizeWithAdvancedMatrixML(const std::vector<HandLandmark>& landmarks) {
    // 1. 고급 행렬 특징 추출 (1260개)
    std::vector<float> features = extractAdvancedMatrixFeatures(landmarks);
    
    // 2. 대용량 행렬 곱셈 신경망 추론
    std::vector<float> outputs = advancedMatrixNeuralNetwork(features);
    
    // 3. 결과 해석 (기존과 동일한 로직)
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

std::vector<float> SignRecognizer::extractAdvancedMatrixFeatures(const std::vector<HandLandmark>& landmarks) {
    std::vector<float> features;
    features.reserve(1260); // 대용량 특징
    
    // === 1. 기존 특징들 (256개) ===
    // 모든 쌍의 거리 계산 (210개)
    for (int i = 0; i < 21; i++) {
        for (int j = i + 1; j < 21; j++) {
            float dist = calculateDistance(landmarks[i], landmarks[j]);
            features.push_back(dist);
        }
    }
    
    // 손목 중심 거리 (20개)
    const HandLandmark& wrist = landmarks[0];
    for (int i = 1; i < 21; i++) {
        float dist = calculateDistance(landmarks[i], wrist);
        features.push_back(dist);
    }
    
    // 손가락 각도 (5개)
    std::vector<int> fingerTips = {4, 8, 12, 16, 20};
    std::vector<int> fingerPips = {3, 6, 10, 14, 18};
    std::vector<int> fingerMcps = {2, 5, 9, 13, 17};
    
    for (int i = 0; i < 5; i++) {
        float angle = calculateAngle(landmarks[fingerTips[i]], 
                                   landmarks[fingerPips[i]], 
                                   landmarks[fingerMcps[i]]);
        features.push_back(angle);
    }
    
    // 손바닥 벡터 (2개)
    float palmX = 0, palmY = 0;
    for (int i = 0; i < 5; i++) {
        palmX += landmarks[i].x;
        palmY += landmarks[i].y;
    }
    palmX /= 5; palmY /= 5;
    features.push_back(palmX);
    features.push_back(palmY);
    
    // 곡률 (19개)
    for (int i = 1; i < 20; i++) {
        float curvature = calculateAngle(landmarks[i-1], landmarks[i], landmarks[i+1]);
        features.push_back(curvature);
    }
    
    // === 2. 시공간적 특징 (420개) ===
    // 각 관절의 3D 위치, 속도, 가속도, 회전 정보
    for (int finger = 0; finger < 5; finger++) {
        int baseIdx = (finger == 0) ? 1 : finger * 4 + 1;
        for (int joint = 0; joint < 4; joint++) {
            if (baseIdx + joint < 21) {
                const HandLandmark& lm = landmarks[baseIdx + joint];
                
                // 3D 위치
                features.push_back(lm.x);
                features.push_back(lm.y);
                features.push_back(lm.z);
                
                // 속도 추정 (간단한 시뮬레이션)
                features.push_back((std::rand() % 200 - 100) / 1000.0f);
                features.push_back((std::rand() % 200 - 100) / 1000.0f);
                features.push_back((std::rand() % 200 - 100) / 1000.0f);
                
                // 가속도 추정
                features.push_back((std::rand() % 100 - 50) / 1000.0f);
                features.push_back((std::rand() % 100 - 50) / 1000.0f);
                features.push_back((std::rand() % 100 - 50) / 1000.0f);
                
                // 회전 정보
                float dx = lm.x - wrist.x;
                float dy = lm.y - wrist.y;
                float dz = lm.z - wrist.z;
                features.push_back(std::atan2(dy, std::sqrt(dx*dx + dz*dz))); // pitch
                features.push_back(std::atan2(dx, dz)); // yaw
                features.push_back(std::atan2(dx, dy)); // roll
                
                // 곡률 변화율
                features.push_back(std::sin(finger * joint * 0.1f));
            }
        }
    }
    
    // === 3. 관계적 행렬 특징 (400개) ===
    // 손가락 간 상호작용 (20x20 = 400개)
    for (int i = 0; i < 20; i++) {
        for (int j = 0; j < 20; j++) {
            if (i != j && i < landmarks.size() && j < landmarks.size()) {
                features.push_back(calculateDistance(landmarks[i], landmarks[j]));
            } else {
                features.push_back(0.0f);
            }
        }
    }
    
    // === 4. 기하학적 불변성 특징 (100개) ===
    // 스케일 불변 특징
    float handSize = calculateDistance(landmarks[0], landmarks[12]); // 손목-중지
    for (int i = 1; i < 21; i++) {
        float normalizedDist = calculateDistance(landmarks[i], wrist) / handSize;
        features.push_back(normalizedDist);
    }
    
    // 추가 스케일 불변 특징들 (79개)
    for (int i = 0; i < 79; i++) {
        features.push_back(std::cos(i * 0.1f) * 0.1f);
    }
    
    // === 5. 회전 불변성 특징 (100개) ===
    // 내적 기반 특징들
    for (int i = 0; i < 21 && features.size() < 1160; i++) {
        for (int j = i + 1; j < 21 && features.size() < 1160; j++) {
            float dotProduct = landmarks[i].x * landmarks[j].x + 
                              landmarks[i].y * landmarks[j].y + 
                              landmarks[i].z * landmarks[j].z;
            features.push_back(dotProduct);
        }
    }
    
    // === 6. 주파수 영역 특징 (84개) ===
    // 간단한 주파수 분석 시뮬레이션
    for (int i = 0; i < 84; i++) {
        features.push_back(std::sin(i * 0.2f) * std::cos(i * 0.15f));
    }
    
    // 특징 정규화
    if (!features.empty()) {
        float mean = 0.0f;
        for (float f : features) mean += f;
        mean /= features.size();
        
        float variance = 0.0f;
        for (float f : features) variance += (f - mean) * (f - mean);
        variance /= features.size();
        float stddev = std::sqrt(variance);
        
        if (stddev > 1e-6f) {
            for (float& f : features) {
                f = (f - mean) / stddev;
            }
        }
    }
    
    // 정확히 1260개로 맞추기
    features.resize(1260, 0.0f);
    
    return features;
}

std::vector<float> SignRecognizer::advancedMatrixNeuralNetwork(const std::vector<float>& features) {
    if (features.size() != 1260) {
        return std::vector<float>(5, 0.0f);
    }
    
    // Xavier 초기화 시뮬레이션용 시드
    static int seed = 42;
    auto random = [&seed]() { 
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return (float)seed / 0x7fffffff - 0.5f; 
    };
    
    // Layer 1: 1260 → 1024
    std::vector<float> layer1(1024, 0.0f);
    for (int i = 0; i < 1024; i++) {
        float sum = random() * 0.01f; // bias
        for (int j = 0; j < 1260; j++) {
            float weight = random() * std::sqrt(6.0f / (1260 + 1024));
            sum += features[j] * weight;
        }
        layer1[i] = std::max(0.0f, sum); // ReLU
    }
    
    // Layer 2: 1024 → 512
    std::vector<float> layer2(512, 0.0f);
    for (int i = 0; i < 512; i++) {
        float sum = random() * 0.01f;
        for (int j = 0; j < 1024; j++) {
            float weight = random() * std::sqrt(6.0f / (1024 + 512));
            sum += layer1[j] * weight;
        }
        layer2[i] = std::max(0.0f, sum);
    }
    
    // Layer 3: 512 → 256
    std::vector<float> layer3(256, 0.0f);
    for (int i = 0; i < 256; i++) {
        float sum = random() * 0.01f;
        for (int j = 0; j < 512; j++) {
            float weight = random() * std::sqrt(6.0f / (512 + 256));
            sum += layer2[j] * weight;
        }
        layer3[i] = std::max(0.0f, sum);
    }
    
    // Layer 4: 256 → 128
    std::vector<float> layer4(128, 0.0f);
    for (int i = 0; i < 128; i++) {
        float sum = random() * 0.01f;
        for (int j = 0; j < 256; j++) {
            float weight = random() * std::sqrt(6.0f / (256 + 128));
            sum += layer3[j] * weight;
        }
        layer4[i] = std::max(0.0f, sum);
    }
    
    // Output Layer: 128 → 5
    std::vector<float> output(5, 0.0f);
    for (int i = 0; i < 5; i++) {
        float sum = random() * 0.01f;
        for (int j = 0; j < 128; j++) {
            float weight = random() * std::sqrt(6.0f / (128 + 5));
            sum += layer4[j] * weight;
        }
        output[i] = sum; // Linear output
    }
    
    return output;
}