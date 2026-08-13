#include <metal_stdlib>
#include <metal_tensor>
#include <MetalPerformancePrimitives/MetalPerformancePrimitives.h>

using namespace metal;
using namespace mpp;

constant int kAlphaProbeTile = 64;

kernel void alpha_mpp_gemm_probe(
    uint2 groupId [[threadgroup_position_in_grid]],
    tensor<device half, dextents<int, 2>> lhs,
    tensor<device half, dextents<int, 2>> rhs,
    tensor<device half, dextents<int, 2>> output)
{
    const int originX = kAlphaProbeTile * int(groupId.x);
    const int originY = kAlphaProbeTile * int(groupId.y);

    auto lhsTile = lhs.slice<dynamic_extent, kAlphaProbeTile>(0, originY);
    auto rhsTile = rhs.slice<kAlphaProbeTile, dynamic_extent>(originX, 0);
    auto outputTile = output.slice<kAlphaProbeTile, kAlphaProbeTile>(originX, originY);

    constexpr auto descriptor = tensor_ops::matmul2d_descriptor(
        kAlphaProbeTile,
        kAlphaProbeTile,
        dynamic_length_v<int>);

    tensor_ops::matmul2d<descriptor, execution_simdgroups<4>> operation;
    auto localResult = operation.get_destination_cooperative_tensor<
        decltype(lhsTile),
        decltype(rhsTile),
        half>();

    operation.run(lhsTile, rhsTile, localResult);
    localResult.store(outputTile);
}
