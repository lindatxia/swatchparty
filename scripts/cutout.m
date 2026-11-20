#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <CoreImage/CoreImage.h>
int main(int argc, const char *argv[]) {
 @autoreleasepool {
  NSString *input=@(argv[1]), *output=@(argv[2]);
  NSURL *url=[NSURL fileURLWithPath:input];
  NSError *error=nil;
  VNGenerateForegroundInstanceMaskRequest *request=[VNGenerateForegroundInstanceMaskRequest new];
  VNImageRequestHandler *handler=[[VNImageRequestHandler alloc] initWithURL:url options:@{}];
  if (![handler performRequests:@[request] error:&error]) { NSLog(@"%@",error); return 1; }
  VNInstanceMaskObservation *mask=request.results.firstObject;
  if (!mask || mask.allInstances.count == 0) return 1;
  CVPixelBufferRef pixels=[mask generateMaskedImageOfInstances:mask.allInstances fromRequestHandler:handler croppedToInstancesExtent:NO error:&error];
  if (!pixels) { NSLog(@"%@",error); return 1; }
  CIImage *image=[CIImage imageWithCVPixelBuffer:pixels];
  CIContext *context=[CIContext contextWithOptions:nil];
  CGColorSpaceRef space=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  BOOL ok=[context writePNGRepresentationOfImage:image toURL:[NSURL fileURLWithPath:output] format:kCIFormatRGBA8 colorSpace:space options:@{} error:&error];
  CGColorSpaceRelease(space); CVPixelBufferRelease(pixels);
  if (!ok) NSLog(@"%@",error);
  return !ok;
 }
}
