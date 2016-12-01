{
  'targets': [
    {
      'target_name': 'caffe',
      'sources': [
        'src/caffe.cpp'
      ],
      'include_dirs': [
        '<!(node -e "require(\'nan\')")',
        '<!(echo $CAFFE_ROOT/include)',
	'./caffe/distribute/include',
        '/usr/local/cuda/include/',
      ],
      'libraries': [
        '-L<!(echo "$CAFFE_ROOT/lib")',
	'-L<!(pwd)/caffe/distribute/lib',
	'<!(if [ -d /usr/local/cuda/lib ]; then echo "-L/usr/local/cuda/lib"; fi)',
	'<!(if [ -d /usr/local/cuda/lib64 ]; then echo "-L/usr/local/cuda/lib64"; fi)',
	'<!(if [ -d /usr/local/cuda ]; then echo "-lcudart"; fi)',
	'-lcaffe',
        '-lglog',
        '-lprotobuf',
        '-lleveldb',
        '-llmdb',
      ],
      'ldflags': [
        '-Wl,-rpath,<!(echo $CAFFE_ROOT/lib)',
	'-Wl,-rpath,<!(pwd)/caffe/distribute/lib',
	'<!(if [ -d /usr/local/cuda/lib ]; then echo "-Wl,-rpath,/usr/local/cuda/lib"; fi)',
	'<!(if [ -d /usr/local/cuda/lib64 ]; then echo "-Wl,-rpath,/usr/local/cuda/lib64"; fi)',
      ],
      'cflags_cc': [
        '-std=c++11',
        '-fexceptions',
      ],
      'defines': [
        '<!(if [ -d /usr/local/cuda ]; then echo "HAVE_CUDA"; else echo "CPU_ONLY"; fi)',
      ],
      'dependencies': [
      ],
      'conditions': [
        ['OS=="win"', {
          'dependencies': [
          ]
        }],
        ['OS=="mac"', {
	  'defines': [
            '<!(if [ -d /usr/local/cuda ]; then echo "HAVE_CUDA"; else echo "CPU_ONLY"; fi)',
          ],
	  'include_dirs': [
            '<!(brew --prefix openblas)' + '/include',
            '<!(brew --prefix boost 2> /dev/null)' + '/include',
	  ],
	  'libraries': [
	    '<!(brew --prefix boost 2> /dev/null)' + '/lib/libopencv_core.dylib',
	    '-lboost_system',
	    '-lboost_thread-mt',
	  ],
          'xcode_settings': {
            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
            'GCC_ENABLE_CPP_RTTI': 'YES',
            'MACOSX_DEPLOYMENT_TARGET': '10.11',
            'OTHER_LDFLAGS': [
	      '-Wl,-rpath,<!(echo $CAFFE_ROOT/lib)',
	      '<!(if [ -d /usr/local/cuda/lib ]; then echo "-Wl,-rpath,/usr/local/cuda/lib"; fi)',
	      '<!(if [ -d /usr/local/cuda/lib64 ]; then echo "-Wl,-rpath,/usr/local/cuda/lib64"; fi)',
            ],
            'OTHER_CFLAGS': [
            ]
          },
          'libraries': [
          ],
        }]
      ]
    }
  ]
}