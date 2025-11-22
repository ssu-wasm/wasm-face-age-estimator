#include <stdint.h>
#include <emscripten/bind.h>
#include <string>
#include <vector>
#include <cmath>
#include <random>
#include "sign_recognition.h"

using namespace emscripten;
using namespace SignRecognition;

// WASM용 SignRecognizer 래퍼 클래스
class SignRecognizerWasm {
private:
    SignRecognizer recognizer_;

public:
    SignRecognizerWasm() = default;
    
    bool initialize() {
        return recognizer_.initialize();
    }
    
    std::string getVersion() const {
        return recognizer_.get_version();
    }
    
    void setDetectionThreshold(float threshold) {
        recognizer_.set_detection_threshold(threshold);
    }
    
    void setRecognitionThreshold(float threshold) {
        recognizer_.set_recognition_threshold(threshold);
    }
    
    // 프레임 처리 (JavaScript에서 호출하기 쉽도록 간소화)
    std::string processFrame(uintptr_t dataPtr, int width, int height, int channels) {
        if (!dataPtr) {
            return "INVALID_DATA";
        }
        
        ImageData image;
        image.data = reinterpret_cast<uint8_t*>(dataPtr);
        image.width = width;
        image.height = height;
        image.channels = channels;
        
        auto result = recognizer_.process_frame(image);
        
        // JSON 형태로 결과 반환
        return "{\"gesture\":\"" + result.gesture_name + 
               "\",\"confidence\":" + std::to_string(result.confidence) +
               ",\"id\":" + std::to_string(result.gesture_id) + "}";
    }
};

// 간단한 이미지 처리 함수들 (기존 유지)
extern "C" {
    // 테스트용 간단한 함수
    int test_function() {
        return 42;
    }
    
    // "안녕" 수어 인식 - 손바닥 펼친 상태 감지
    std::string simple_gesture_detect(uintptr_t dataPtr, int width, int height) {
        if (!dataPtr || width <= 0 || height <= 0) {
            return "{\"gesture\":\"감지되지 않음\",\"confidence\":0.0,\"id\":0}";
        }
        
        uint8_t* data = reinterpret_cast<uint8_t*>(dataPtr);
        const int totalPixels = width * height;
        
        // 1. 피부색 영역 검출 및 통계 계산
        int skinPixels = 0;
        int totalBrightness = 0;
        int edgePixels = 0;
        
        // ROI 영역 전체 스캔
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                int idx = (y * width + x) * 4;
                uint8_t r = data[idx];
                uint8_t g = data[idx + 1];
                uint8_t b = data[idx + 2];
                
                // YCrCb 색공간 기반 피부색 검출
                float Y = 0.299f * r + 0.587f * g + 0.114f * b;
                float Cr = 0.713f * (r - Y);
                float Cb = 0.564f * (b - Y);
                
                // 피부색 범위 체크
                bool isSkin = (Y > 80 && Cr > -15 && Cr < 25 && Cb > -30 && Cb < 20);
                
                if (isSkin) {
                    skinPixels++;
                    totalBrightness += static_cast<int>(Y);
                    
                    // 엣지 검출 (손가락 경계 감지)
                    if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
                        // 주변 픽셀과의 밝기 차이
                        int idxUp = ((y - 1) * width + x) * 4;
                        int idxDown = ((y + 1) * width + x) * 4;
                        int idxLeft = (y * width + (x - 1)) * 4;
                        int idxRight = (y * width + (x + 1)) * 4;
                        
                        float Y_up = 0.299f * data[idxUp] + 0.587f * data[idxUp + 1] + 0.114f * data[idxUp + 2];
                        float Y_down = 0.299f * data[idxDown] + 0.587f * data[idxDown + 1] + 0.114f * data[idxDown + 2];
                        float Y_left = 0.299f * data[idxLeft] + 0.587f * data[idxLeft + 1] + 0.114f * data[idxLeft + 2];
                        float Y_right = 0.299f * data[idxRight] + 0.587f * data[idxRight + 1] + 0.114f * data[idxRight + 2];
                        
                        float gradient = std::abs(Y - Y_up) + std::abs(Y - Y_down) + 
                                        std::abs(Y - Y_left) + std::abs(Y - Y_right);
                        
                        if (gradient > 30.0f) {
                            edgePixels++;
                        }
                    }
                }
            }
        }
        
        if (skinPixels == 0) {
            return "{\"gesture\":\"감지되지 않음\",\"confidence\":0.0,\"id\":0}";
        }
        
        // 2. 손바닥 펼친 상태 특징 분석
        float skinRatio = static_cast<float>(skinPixels) / totalPixels;
        float avgBrightness = static_cast<float>(totalBrightness) / skinPixels;
        float edgeRatio = static_cast<float>(edgePixels) / skinPixels;
        
        // 3. "안녕" 제스처 판별 (손바닥 펼친 상태)
        // 특징:
        // - 피부색 비율이 높음 (손이 잘 보임)
        // - 엣지 비율이 높음 (손가락이 펼쳐져서 경계가 많음)
        // - 밝기가 적당함
        
        float confidence = 0.0f;
        std::string gesture = "감지되지 않음";
        int gestureId = 0;
        
        // "안녕" 제스처 판별 조건
        bool isHelloGesture = (skinRatio > 0.3f && skinRatio < 0.9f) &&  // 손 영역이 적당한 크기
                              (edgeRatio > 0.15f) &&  // 손가락이 펼쳐져서 엣지가 많음
                              (avgBrightness > 100.0f && avgBrightness < 200.0f);  // 적당한 밝기
        
        if (isHelloGesture) {
            // 신뢰도 계산
            confidence = 0.5f + 
                         (skinRatio - 0.3f) * 0.5f +  // 피부색 비율 기여도
                         (edgeRatio - 0.15f) * 0.3f;  // 엣지 비율 기여도
            
            confidence = std::min(0.95f, std::max(0.5f, confidence));
            
            gesture = "안녕";
            gestureId = 1;
        } else {
            // 다른 제스처 가능성 체크
            if (skinRatio > 0.2f && edgeRatio < 0.1f) {
                // 주먹 쥔 상태 (엣지가 적음)
                gesture = "감사합니다";
                gestureId = 2;
                confidence = 0.6f;
            } else if (skinRatio > 0.1f && skinRatio < 0.3f && edgeRatio > 0.2f) {
                // 검지만 세운 상태
                gesture = "예";
                gestureId = 3;
                confidence = 0.6f;
            }
        }
        
        // JSON 결과 반환
        std::string result = "{\"gesture\":\"" + gesture + 
                            "\",\"confidence\":" + std::to_string(confidence) +
                            ",\"id\":" + std::to_string(gestureId) + "}";
        
        return result;
    }
    
    void process_frame_green(uint8_t* data, int width, int height) {
        int numPixels = width * height;
        for (int i = 0; i < numPixels; ++i) {
            int idx = i * 4; // RGBA
            data[idx + 0] = 0;   // R
            data[idx + 1] = 255; // G
            data[idx + 2] = 0;   // B
            data[idx + 3] = 255; // A
        }
    }

    void process_frame_binding(uintptr_t dataPtr, int width, int height) {
        auto* data = reinterpret_cast<uint8_t*>(dataPtr);
        process_frame_green(data, width, height);
    }

    void applyGrayscale(uintptr_t bufferPtr, int width, int height) {
        uint8_t* data = reinterpret_cast<uint8_t*>(bufferPtr);
        const int length = width * height * 4; // RGBA

        for (int i = 0; i < length; i += 4) {
            uint8_t r = data[i];
            uint8_t g = data[i + 1];
            uint8_t b = data[i + 2];

            uint8_t gray = static_cast<uint8_t>((r + g + b) / 3);
            
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
        }
    }
    
    // 손 윤곽선 강조 필터
    void enhanceHandContours(uintptr_t bufferPtr, int width, int height) {
        uint8_t* data = reinterpret_cast<uint8_t*>(bufferPtr);
        
        // 간단한 엣지 강화 필터
        for (int y = 1; y < height - 1; ++y) {
            for (int x = 1; x < width - 1; ++x) {
                int idx = (y * width + x) * 4;
                
                // Sobel 연산자 적용 (간단화)
                int gx = -data[idx - 4] + data[idx + 4];
                int gy = -data[idx - width * 4] + data[idx + width * 4];
                
                int magnitude = std::min(255, static_cast<int>(std::sqrt(gx*gx + gy*gy)));
                
                // 엣지가 강한 부분 강조
                if (magnitude > 50) {
                    data[idx] = std::min(255, data[idx] + magnitude/4);     // R
                    data[idx + 1] = std::min(255, data[idx + 1] + magnitude/4); // G
                    data[idx + 2] = std::min(255, data[idx + 2] + magnitude/4); // B
                }
            }
        }
    }
    
    // 피부색 영역 강조
    void enhanceSkinTone(uintptr_t bufferPtr, int width, int height) {
        uint8_t* data = reinterpret_cast<uint8_t*>(bufferPtr);
        const int length = width * height * 4;
        
        for (int i = 0; i < length; i += 4) {
            uint8_t r = data[i];
            uint8_t g = data[i + 1];
            uint8_t b = data[i + 2];
            
            // 피부색 범위 검사 (간단한 HSV 기반)
            bool is_skin = (r > 95 && g > 40 && b > 20 && 
                           std::max({r, g, b}) - std::min({r, g, b}) > 15 &&
                           std::abs(r - g) > 15 && r > g && r > b);
            
            if (is_skin) {
                // 피부색 영역 밝게
                data[i] = std::min(255, static_cast<int>(r * 1.2f));
                data[i + 1] = std::min(255, static_cast<int>(g * 1.2f));
                data[i + 2] = std::min(255, static_cast<int>(b * 1.2f));
            } else {
                // 비피부색 영역 어둡게
                data[i] = static_cast<uint8_t>(r * 0.7f);
                data[i + 1] = static_cast<uint8_t>(g * 0.7f);
                data[i + 2] = static_cast<uint8_t>(b * 0.7f);
            }
        }
    }
}

EMSCRIPTEN_BINDINGS(sign_wasm) {
    // 수어 인식 클래스
    class_<SignRecognizerWasm>("SignRecognizer")
        .constructor<>()
        .function("initialize", &SignRecognizerWasm::initialize)
        .function("getVersion", &SignRecognizerWasm::getVersion)
        .function("setDetectionThreshold", &SignRecognizerWasm::setDetectionThreshold)
        .function("setRecognitionThreshold", &SignRecognizerWasm::setRecognitionThreshold)
        .function("processFrame", &SignRecognizerWasm::processFrame);
    
    // 테스트 함수
    function("test_function", &test_function);
    function("simple_gesture_detect", &simple_gesture_detect);
    
    // 이미지 처리 함수들
    function("process_frame", &process_frame_binding);
    function("applyGrayscale", &applyGrayscale);
    function("enhanceHandContours", &enhanceHandContours);
    function("enhanceSkinTone", &enhanceSkinTone);
}
