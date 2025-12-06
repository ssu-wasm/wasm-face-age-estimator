#ifndef SIGN_RECOGNITION_H
#define SIGN_RECOGNITION_H

#include <emscripten/bind.h>
#include <vector>
#include <string>
#include <cmath>
#include <algorithm>
#include <iostream>

// 손 랜드마크 구조체
struct HandLandmark {
    float x;
    float y;
    float z;
};

// 인식 결과 구조체
struct RecognitionResult {
    std::string gesture;
    float confidence;
    int id;
};

// 제스처 인식기 클래스
class SignRecognizer {
public:
    SignRecognizer();
    ~SignRecognizer();
    
    // 초기화
    bool initialize();
    
    // 랜드마크로부터 제스처 인식
    RecognitionResult recognize(const std::vector<HandLandmark>& landmarks);
    
    // 랜드마크 배열 포인터로 인식 (WASM에서 사용)
    std::string recognizeFromPointer(float* landmarks, int count);
    
    // 임계값 설정
    void setDetectionThreshold(float threshold);
    void setRecognitionThreshold(float threshold);
    
    // 버전 정보
    std::string getVersion() const;

private:
    // 손가락이 펴져있는지 확인
    bool isFingerExtended(const HandLandmark& tip, const HandLandmark& pip, const HandLandmark& mcp) const;
    
    // 엄지가 펴져있는지 확인
    bool isThumbExtended(const HandLandmark& thumbTip, const HandLandmark& thumbIp, const HandLandmark& wrist) const;
    
    // 규칙 기반 제스처 인식
    RecognitionResult recognizeByRules(const std::vector<HandLandmark>& landmarks);
    
    // 고급 ML 스타일 인식 (최적화된 C++ 버전)
    RecognitionResult recognizeWithAdvancedML(const std::vector<HandLandmark>& landmarks);
    
    // 특징 추출
    std::vector<float> extractComplexFeatures(const std::vector<HandLandmark>& landmarks);
    
    // 가상 신경망 추론
    std::vector<float> neuralNetworkInference(const std::vector<float>& features);
    
    // 행렬 연산
    void matrixMultiply(const std::vector<std::vector<float>>& A, 
                       const std::vector<float>& B, 
                       std::vector<float>& result);
    
    // 빠른 컨볼루션 연산
    void fastConvolution(const std::vector<float>& input, 
                        const std::vector<float>& kernel,
                        std::vector<float>& output, 
                        int inputSize, int kernelSize);
    
    // SIMD 최적화된 벡터 연산
    float vectorDotProduct(const float* a, const float* b, int size);
    void vectorAdd(const float* a, const float* b, float* result, int size);
    void vectorMultiply(const float* a, float scalar, float* result, int size);
    
    // 랜드마크 정규화
    std::vector<float> normalizeLandmarks(const std::vector<HandLandmark>& landmarks);
    
    // 거리 계산
    float calculateDistance(const HandLandmark& a, const HandLandmark& b) const;
    
    // 각도 계산
    float calculateAngle(const HandLandmark& a, const HandLandmark& b, const HandLandmark& c) const;
    
    // 가중치 캐시 (사전 계산된 ML 가중치들)
    static std::vector<std::vector<float>> neuralWeights;
    static std::vector<float> neuralBiases;
    
    float detectionThreshold;
    float recognitionThreshold;
};

// Embind 바인딩은 main.cpp에서 처리

class SignRecognition {
public:
    SignRecognition();
    ~SignRecognition();

    // MLP 모델 예측 함수 (선언만)
    int predictMLP(const std::vector<float>& featureArr);

    // Scaler 설정 함수 (선언만)
    void setScaler(const std::vector<float>& meanArr, const std::vector<float>& scaleArr);

private:
    static constexpr int D_IN = 126;
    static constexpr int H1 = 128;
    static constexpr int H2 = 64;
    static constexpr int NUM_CLASSES = 4;

    std::vector<float> mean;
    std::vector<float> scale;
};

#endif // SIGN_RECOGNITION_H
